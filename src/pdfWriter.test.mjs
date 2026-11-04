import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { picturesToPdf } from './pdfWriter.ts'

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])

test('pictures become one A4 page each, turned to suit the picture, in a PDF that reads back', async () => {
  const pdf = picturesToPdf([{ jpeg, width: 1654, height: 2339 }, { jpeg, width: 1600, height: 1200 }])
  const text = new TextDecoder('latin1').decode(pdf)
  assert.match(text, /^%PDF-1\.4\n/)
  assert.match(text, /%%EOF\n$/)
  // Every cross-reference points at the start of its object.
  const xref = Number(/startxref\n(\d+)/.exec(text)[1])
  const offsets = text.slice(xref).match(/^\d{10} 00000 n $/gm).map(line => Number(line.slice(0, 10)))
  offsets.forEach((offset, index) => assert.ok(text.startsWith(`${index + 1} 0 obj`, offset)))

  const loading = getDocument({ data: pdf, verbosity: 0 })
  const document = await loading.promise
  assert.equal(document.numPages, 2)
  const sizes = []
  for (const number of [1, 2]) sizes.push((await document.getPage(number)).view.map(Math.round))
  assert.deepEqual(sizes, [[0, 0, 595, 842], [0, 0, 842, 595]])
  await loading.destroy()
})
