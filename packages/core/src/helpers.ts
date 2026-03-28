/**
 * Recursively converts JS Maps (WASM default) into Plain Objects.
 */
export function mapToObj(data: any): any {
  if (data instanceof Map) {
    const obj: any = {};
    data.forEach((value, key) => {
      obj[key] = mapToObj(value);
    });
    return obj;
  }
  if (Array.isArray(data)) {
    return data.map(mapToObj);
  }
  return data;
}