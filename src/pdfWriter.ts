// A PDF of whole-page pictures, written by hand so a 발주서 kept as pictures can be saved as one
// PDF without a library: each JPEG fills an A4 page, turned landscape for wide pictures.
export type PdfPicture = { jpeg: Uint8Array; width: number; height: number }

const a4 = [595.28, 841.89]
const number = (value: number) => value.toFixed(2)

export function picturesToPdf(pictures: PdfPicture[]) {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const write = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part
    parts.push(bytes)
    length += bytes.length
  }
  const object = (id: number, ...body: (string | Uint8Array)[]) => {
    offsets[id] = length
    write(`${id} 0 obj\n`)
    body.forEach(write)
    write('\nendobj\n')
  }

  // The second line's high bytes mark the file as binary.
  write('%PDF-1.4\n%âãÏÓ\n')
  // Objects: 1 catalog, 2 page list, then a page, its picture and its drawing for each picture.
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, `<< /Type /Pages /Kids [${pictures.map((_, index) => `${3 + index * 3} 0 R`).join(' ')}] /Count ${pictures.length} >>`)
  pictures.forEach((picture, index) => {
    const [page, image, content] = [3, 4, 5].map(id => id + index * 3)
    const [pageWidth, pageHeight] = picture.width > picture.height ? [a4[1], a4[0]] : a4
    const scale = Math.min(pageWidth / picture.width, pageHeight / picture.height)
    const [width, height] = [picture.width * scale, picture.height * scale]
    const draw = `q ${number(width)} 0 0 ${number(height)} ${number((pageWidth - width) / 2)} ${number((pageHeight - height) / 2)} cm /Im0 Do Q`
    object(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${number(pageWidth)} ${number(pageHeight)}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`)
    object(image, `<< /Type /XObject /Subtype /Image /Width ${picture.width} /Height ${picture.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${picture.jpeg.length} >>\nstream\n`, picture.jpeg, '\nendstream')
    object(content, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`)
  })
  const xref = length
  const count = 3 + pictures.length * 3
  write(`xref\n0 ${count}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`)
  write(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const pdf = new Uint8Array(length)
  let at = 0
  for (const part of parts) { pdf.set(part, at); at += part.length }
  return pdf
}
