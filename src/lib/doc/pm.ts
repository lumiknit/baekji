import {
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  MarkdownParser,
  MarkdownSerializer,
  schema as mdSchema,
} from 'prosemirror-markdown';
import { Schema, type MarkSpec } from 'prosemirror-model';
import { addListNodes } from 'prosemirror-schema-list';

export const pmSchema = new Schema({
  nodes: addListNodes(mdSchema.spec.nodes, 'block+', 'block'),
  marks: mdSchema.spec.marks.append({
    strikethrough: {
      parseDOM: [
        { tag: 'strike' },
        { tag: 's' },
        { style: 'text-decoration=line-through' },
      ],
      toDOM(): [string, Record<string, string>, number] {
        return ['s', {}, 0];
      },
    } as MarkSpec,
  }),
});

export const pmParser = new MarkdownParser(
  pmSchema,
  defaultMarkdownParser.tokenizer,
  {
    ...defaultMarkdownParser.tokens,
    s: { mark: 'strikethrough' },
  },
);

export const pmSerializer = new MarkdownSerializer(
  defaultMarkdownSerializer.nodes,
  {
    ...defaultMarkdownSerializer.marks,
    strikethrough: {
      open: '~~',
      close: '~~',
      mixable: true,
      expelEnclosingWhitespace: true,
    },
  },
);
