export function image2BitmapDataChunked(
  src: string,
  width: number,
  maxWidth: number
) {
  return new Promise<number[][]>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Create canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject('Ctx not available');
        return;
      }

      const widthRatio = width > maxWidth ? maxWidth : width;

      const ratio = img.width > widthRatio ? widthRatio / img.width : 1;
      canvas.width = maxWidth;
      canvas.height =
        (img.height * ratio) % 8 === 0
          ? img.height * ratio
          : Math.ceil((img.height * ratio) / 8) * 8;

      // Draw image on canvas
      ctx.drawImage(
        img,
        0,
        0,
        img.width,
        img.height,
        (canvas.width - img.width * ratio) / 2,
        (canvas.height - img.height * ratio) / 2,
        img.width * ratio,
        img.height * ratio
      );

      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Convert to monochrome bitmap
      const threshold = 128; // Threshold for deciding black or white
      const bitmapDataChunked: number[][] = [];
      let currentChunk = 0;
      let col = 0;

      bitmapDataChunked.push([]);

      for (let i = 0; i < data.length; i += 4) {
        const rgb = data[i] + data[i + 1] + data[i + 2];
        const brightness = rgb / 3; // Simple brightness calculation
        const bit = rgb === 0 ? 0 : brightness < threshold ? 1 : 0; // Convert to 1-bit black/white
        const row = (i / 4) % canvas.width;

        if (bitmapDataChunked[currentChunk][row] === undefined) {
          bitmapDataChunked[currentChunk][row] = 0;
        }

        bitmapDataChunked[currentChunk][row] =
          (bitmapDataChunked[currentChunk][row] << 1) | bit;

        if (row === canvas.width - 1) {
          col++;
        }

        if (
          row === canvas.width - 1 &&
          col % 8 === 0 &&
          col !== canvas.height
        ) {
          currentChunk++;
          bitmapDataChunked.push([]);
        }
      }
      // Now you have the bitmap data ready to send to the printer
      resolve(bitmapDataChunked);
    };
    img.src = src;
  });
}

export function wrapData4Table(widths: number[], data: string[][]) {
  const result = [...data];
  let cursor = 0;
  while (cursor < result.length) {
    let overflowed = false;
    for (let i = 0; i < result[cursor].length; i++) {
      if (result[cursor][i].length > widths[i]) {
        if (!overflowed) {
          const newElement = new Array<string>(result[cursor].length);
          newElement.fill('');
          result.splice(cursor + 1, 0, newElement);
          overflowed = true;
        }

        const temp = result[cursor][i];
        result[cursor][i] = temp.substring(0, widths[i]);
        result[cursor + 1][i] = temp.substring(widths[i], temp.length);
      }
    }
    cursor++;
  }
  return result;
}
