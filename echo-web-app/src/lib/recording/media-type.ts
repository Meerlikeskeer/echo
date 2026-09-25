/** Container metadata can differ only in parameter whitespace across engines. */
export const normalizeMime = (type: string) => type.toLowerCase().split(";").map((part) => part.trim()).join(";");
