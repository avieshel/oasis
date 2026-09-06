export interface AdfText {
  type: 'text';
  text: string;
}

export interface AdfParagraph {
  type: 'paragraph';
  content: AdfText[];
}

export interface AdfDocument {
  type: 'doc';
  version: 1;
  content: AdfParagraph[];
}

export function buildAdfDocument(text: string): AdfDocument {
  const paragraphs = text.split(/\r?\n/).map((line): AdfParagraph => ({
    type: 'paragraph',
    content: line.length > 0 ? [{ type: 'text', text: line }] : [],
  }));
  return { type: 'doc', version: 1, content: paragraphs };
}
