import type { ImageContent, Message, TextContent } from "@havliand_agent/ai";

const IMAGE_URL_PATTERN =
	/\b(?:https?:\/\/|file:\/\/|\/|~\/)[^\s<>"']+\.(?:png|jpe?g|gif|webp|bmp|heic|heif|tiff?)(?:\?[^\s<>"']*)?/giu;
const DATA_IMAGE_PATTERN = /data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/giu;
const FILE_TAG_PATTERN = /<file name="[^"]*">([\s\S]*?)<\/file>/gu;

function imageLabel(index: number): string {
	return `[image${index}]`;
}

function isImageContent(part: TextContent | ImageContent): part is ImageContent {
	return part.type === "image";
}

export function formatImageReferencesForDisplay(text: string, imageCount: number): string {
	let nextIndex = 1;
	let formatted = text.replace(FILE_TAG_PATTERN, (_match, body: string) => {
		if (nextIndex > imageCount) return _match;
		const label = imageLabel(nextIndex++);
		const trimmedBody = body.trim();
		return trimmedBody ? `${label}\n${trimmedBody}` : label;
	});

	const replaceImageReference = (_value: string): string => {
		const label = imageLabel(nextIndex++);
		return label;
	};

	formatted = formatted.replace(DATA_IMAGE_PATTERN, replaceImageReference);
	formatted = formatted.replace(IMAGE_URL_PATTERN, replaceImageReference);

	const labelsToAppend: string[] = [];
	while (nextIndex <= imageCount) {
		labelsToAppend.push(imageLabel(nextIndex++));
	}
	if (labelsToAppend.length > 0) {
		formatted = formatted.trimEnd();
		formatted += `${formatted ? "\n" : ""}${labelsToAppend.join(" ")}`;
	}

	return formatted;
}

export function formatUserMessageForDisplay(message: Message): string {
	if (message.role !== "user") return "";
	if (typeof message.content === "string") {
		return formatImageReferencesForDisplay(message.content, 0);
	}

	const text = message.content
		.filter((part): part is TextContent => part.type === "text")
		.map((part) => part.text)
		.join("");
	const imageCount = message.content.filter(isImageContent).length;
	return formatImageReferencesForDisplay(text, imageCount);
}
