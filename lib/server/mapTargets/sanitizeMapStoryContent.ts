function stripLinkArtifacts(input: string): string {
  return input
    .replace(/\[oai_citation:[^\]]*]/gi, "")
    .replace(/\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/gi, (_match, label: string) => {
      const trimmedLabel = label.trim();
      if (!trimmedLabel || /^oai_citation:/i.test(trimmedLabel)) {
        return "";
      }
      return trimmedLabel;
    })
    .replace(/https?:\/\/[^\s)]+/gi, "")
    .replace(/\s+\)/g, ")")
    .replace(/\(\s*\)/g, "");
}

export function sanitizeMapStoryText(input: string): string {
  return stripLinkArtifacts(input)
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function sanitizeMapStoryContent(input: string): string {
  return input
    .replace(/\/n\/n\/?/gi, "\n\n")
    .replace(/\\n\\n/g, "\n\n")
    .replace(/\/n\/?/gi, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) =>
      sanitizeMapStoryText(
        line
          .replace(/^\s*#{1,6}\s*/g, "")
          .replace(/^\s*[*•\-\/]+\s*/g, "")
          .replace(/[*/#]+$/g, "")
          .trim(),
      ),
    )
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
