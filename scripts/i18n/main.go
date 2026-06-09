// i18n audit tool: finds missing/unused keys across locale files and source code.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

const (
	i18nDir  = "../../src/lib/i18n"
	srcDir   = "../../src"
	outDir   = "_temp"
	usedFile = "_temp/used.txt"
	diffFile = "_temp/diff.txt"
)

// flattenJSON recursively flattens a nested JSON object into dot-separated keys.
func flattenJSON(obj map[string]any, prefix string, out map[string]struct{}) {
	for k, v := range obj {
		key := k
		if prefix != "" {
			key = prefix + "." + k
		}
		switch val := v.(type) {
		case map[string]any:
			flattenJSON(val, key, out)
		default:
			out[key] = struct{}{}
		}
	}
}

func loadLocaleKeys(path string) (map[string]struct{}, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var obj map[string]any
	if err := json.Unmarshal(data, &obj); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	keys := make(map[string]struct{})
	flattenJSON(obj, "", keys)
	return keys, nil
}

// extractUsedKeys scans .ts/.tsx files for s('...') or s("...") calls.
var usedKeyRe = regexp.MustCompile(`\Ws\(['"]([^'"]+)['"]\s*[,)]`)

func extractUsedKeys(root string) (map[string]struct{}, error) {
	keys := make(map[string]struct{})
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		ext := filepath.Ext(path)
		if ext != ".ts" && ext != ".tsx" {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		matches := usedKeyRe.FindAllSubmatch(data, -1)
		for _, m := range matches {
			keys[string(m[1])] = struct{}{}
		}
		return nil
	})
	return keys, err
}

func sortedKeys(m map[string]struct{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func writeLines(path string, lines []string) error {
	return os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o644)
}

func main() {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		fmt.Fprintln(os.Stderr, "mkdir:", err)
		os.Exit(1)
	}

	// Load all locale JSON files
	entries, err := os.ReadDir(i18nDir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "read i18n dir:", err)
		os.Exit(1)
	}

	locales := map[string]map[string]struct{}{} // lang -> key set
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
			continue
		}
		lang := strings.TrimSuffix(e.Name(), ".json")
		keys, err := loadLocaleKeys(filepath.Join(i18nDir, e.Name()))
		if err != nil {
			fmt.Fprintln(os.Stderr, "load locale:", err)
			os.Exit(1)
		}
		locales[lang] = keys

		flatPath := filepath.Join(outDir, lang+"_flat.txt")
		if err := writeLines(flatPath, sortedKeys(keys)); err != nil {
			fmt.Fprintln(os.Stderr, "write flat:", err)
			os.Exit(1)
		}
		fmt.Printf("wrote %s (%d keys)\n", flatPath, len(keys))
	}

	// Extract used keys from source
	usedKeys, err := extractUsedKeys(srcDir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "extract used keys:", err)
		os.Exit(1)
	}
	if err := writeLines(usedFile, sortedKeys(usedKeys)); err != nil {
		fmt.Fprintln(os.Stderr, "write used:", err)
		os.Exit(1)
	}
	fmt.Printf("wrote %s (%d keys)\n", usedFile, len(usedKeys))

	// Build union of all keys
	allKeys := make(map[string]struct{})
	for _, keys := range locales {
		for k := range keys {
			allKeys[k] = struct{}{}
		}
	}
	for k := range usedKeys {
		allKeys[k] = struct{}{}
	}

	// Sorted locale names for consistent column order
	langNames := make([]string, 0, len(locales))
	for l := range locales {
		langNames = append(langNames, l)
	}
	sort.Strings(langNames)

	// Build diff: only keys missing from at least one source
	var diffLines []string
	header := fmt.Sprintf("%-60s  %-8s  %s", "KEY", "src", strings.Join(langNames, "  "))
	diffLines = append(diffLines, header)
	diffLines = append(diffLines, strings.Repeat("-", len(header)))

	missing := 0
	for _, k := range sortedKeys(allKeys) {
		_, inSrc := usedKeys[k]

		cols := make([]string, len(langNames))
		allPresent := inSrc
		for i, lang := range langNames {
			_, ok := locales[lang][k]
			if ok {
				cols[i] = "OK      "
			} else {
				cols[i] = "MISSING "
				allPresent = false
			}
		}
		if !inSrc {
			allPresent = false
		}
		if allPresent {
			continue
		}

		srcMark := "OK"
		if !inSrc {
			srcMark = "MISSING"
		}
		diffLines = append(diffLines, fmt.Sprintf("%-60s  %-8s  %s", k, srcMark, strings.Join(cols, "  ")))
		missing++
	}

	if err := writeLines(diffFile, diffLines); err != nil {
		fmt.Fprintln(os.Stderr, "write diff:", err)
		os.Exit(1)
	}
	fmt.Printf("wrote %s (%d keys with gaps)\n", diffFile, missing)
}
