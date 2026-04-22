// Noto font downloader
// Usage: go run noto-downloader/ <FONT_FAMILY>

package main

import (
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"regexp"
	"strings"
)

// Noto sans CSS URLs
var FontCSSURLs = map[string]string{
	"sans":  "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100..900&display=swap",
	"serif": "https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@200..900&display=swap",
}

func logf(format string, args ...any) {
	fmt.Printf("[SCRIPT] "+format+"\n", args...)
}

func DownloadURL(url string) ([]byte, error) {
	cli := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	req.Header.Add("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")
	if err != nil {
		return nil, err
	}
	resp, err := cli.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to download")
	}
	return io.ReadAll(resp.Body)
}

func main() {
	family := flag.String("family", "", "Font family (sans or serif)")
	flag.Parse()

	// Check css URL
	logf("Checking font family: %s", *family)
	cssURL, ok := FontCSSURLs[*family]
	if !ok {
		panic("Invalid font family. Use 'sans' or 'serif'.")
	}

	// Download CSS
	logf("Downloading CSS from: %s", cssURL)
	cssData, err := DownloadURL(cssURL)
	if err != nil {
		panic(err)
	}

	// Make src map
	// Download each font file and keep to rename map
	logf("Parsing CSS and preparing download...")
	downloadPath := os.MkdirAll(path.Join("public", "fonts", *family), 0755)
	if downloadPath != nil {
		panic(downloadPath)
	}
	renameMap := make(map[string]string)

	pat := regexp.MustCompile(
		`src:\s*url\(([-_A-Za-z0-9.:/]+\.woff2)\)\s+format\('woff2'\)`,
	)

	// Match all
	logf("Extracting font URLs from CSS...")
	logf("[CSS] %s\n", string(cssData))
	matches := pat.FindAllStringSubmatch(string(cssData), -1)
	if matches == nil {
		panic("No matches found")
	}

	for idx, match := range matches {
		logf("Processing font %d: %s", idx+1, match[1])
		url := match[1]
		newName := fmt.Sprintf("%s-%d.woff2", *family, idx)
		renameMap[url] = newName
		fontData, err := DownloadURL(url)
		if err != nil {
			panic(err)
		}
		filename := path.Join("public", "fonts", *family, newName)
		err = os.WriteFile(filename, fontData, 0644)
		if err != nil {
			panic(err)
		}
		logf("-> Downloaded and saved as: %s", filename)
	}

	logf("All fonts downloaded successfully!")

	// Writing URL replaced CSS based on rename map
	logf("Writing modified CSS with local font URLs...")
	modifiedCSS := string(cssData)
	for oldURL, newName := range renameMap {
		modifiedCSS = strings.ReplaceAll(modifiedCSS, oldURL, fmt.Sprintf("/fonts/%s/%s", *family, newName))
	}

	cssFilename := path.Join("public", "fonts", *family, "font.css")
	err = os.WriteFile(cssFilename, []byte(modifiedCSS), 0644)
	if err != nil {
		panic(err)
	}
	logf("Modified CSS saved as: %s", cssFilename)
}
