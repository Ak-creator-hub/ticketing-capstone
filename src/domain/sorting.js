function defaultCompare(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function mergeSort(items, compare = defaultCompare) {
  let source = [...items];
  let target = new Array(source.length);

  for (let width = 1; width < source.length; width *= 2) {
    for (let start = 0; start < source.length; start += width * 2) {
      const middle = Math.min(start + width, source.length);
      const end = Math.min(start + width * 2, source.length);
      let leftIndex = start;
      let rightIndex = middle;
      let targetIndex = start;

      while (leftIndex < middle && rightIndex < end) {
        if (compare(source[leftIndex], source[rightIndex]) <= 0) {
          target[targetIndex] = source[leftIndex];
          leftIndex += 1;
        } else {
          target[targetIndex] = source[rightIndex];
          rightIndex += 1;
        }
        targetIndex += 1;
      }

      while (leftIndex < middle) {
        target[targetIndex] = source[leftIndex];
        leftIndex += 1;
        targetIndex += 1;
      }
      while (rightIndex < end) {
        target[targetIndex] = source[rightIndex];
        rightIndex += 1;
        targetIndex += 1;
      }
    }

    [source, target] = [target, source];
  }

  return source;
}
