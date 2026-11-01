import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function validateApplicationUpload(fields, pdf) {
  if (!pdf || !pdf.data.length || pdf.data.length > 10 * 1024 * 1024) {
    throw Object.assign(new Error('CV musi być plikiem PDF o rozmiarze do 10 MB.'), {
      status: pdf?.data.length > 10 * 1024 * 1024 ? 413 : 400,
    });
  }
  if (!pdf.data.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw Object.assign(new Error('CV musi być plikiem PDF.'), { status: 400 });
  }
  if (fields.consent !== 'yes' || !fields.consentVersion) {
    throw Object.assign(new Error('Wymagana zgoda na przetwarzanie danych.'), { status: 400 });
  }
  return {
    input: { name: fields.name, email: fields.email, consentVersion: fields.consentVersion },
    pdf,
  };
}

async function readApplication(req) {
  const contentType = req.headers['content-type'] || '';
  const boundary = contentType
    .match(/^multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;]+))/i)
    ?.slice(1)
    .find(Boolean);
  if (!boundary || boundary.length > 200) {
    throw Object.assign(new Error('Wymagane dane formularza multipart.'), { status: 400 });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 11 * 1024 * 1024) {
      throw Object.assign(new Error('Plik CV przekracza 10 MB.'), { status: 413 });
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  const fields = {};
  let pdf;
  const marker = `--${boundary}`;
  let offset = body.indexOf(marker) + marker.length;
  for (const part of body.toString('latin1').split(marker).slice(1, -1)) {
    const split = part.indexOf('\r\n\r\n');
    const disposition = part
      .slice(0, split)
      .match(/content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
    if (split >= 0 && disposition) {
      const data = body.subarray(offset + split + 4, offset + part.length - 2);
      if (disposition[2] !== undefined) {
        pdf = { data, originalName: disposition[2] };
      } else {
        fields[disposition[1]] = data.toString('utf8');
      }
    }
    offset += part.length + marker.length;
  }
  return validateApplicationUpload(fields, pdf);
}

export function createApplicationRoutes(store, dataDir) {
  async function submit(req, id, send) {
    const key = req.headers['idempotency-key'];
    if (!key || key.length > 128) {
      return send(400, { error: 'Wymagany poprawny Idempotency-Key.' });
    }
    const { input, pdf } = await readApplication(req);
    const cv = {
      id: randomUUID(),
      originalName: pdf.originalName.slice(0, 255),
      sha256: createHash('sha256').update(pdf.data).digest('hex'),
      sizeBytes: pdf.data.length,
    };
    const directory = resolve(dataDir, 'cv');
    await mkdir(directory, { recursive: true });
    cv.storagePath = resolve(directory, `${cv.id}.pdf`);
    await writeFile(cv.storagePath, pdf.data, { flag: 'wx', mode: 0o600 });
    try {
      const result = store.createApplication(id, input, key, cv);
      if (!result.created) {
        await unlink(cv.storagePath);
      }
      return send(201, { application: result.application });
    } catch (error) {
      await unlink(cv.storagePath).catch(() => undefined);
      throw error;
    }
  }
  return { submit };
}
