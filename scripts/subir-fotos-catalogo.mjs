/**
 * Sube fotos al catálogo replicando EXACTAMENTE lo que hace
 * cadincsrl/src/modules/stock/stock-fotos.service.ts:
 *   path `material/<id>/<uuid>.<ext>`, bucket público `catalogo-fotos`,
 *   sha256 recalculado del archivo, url pública guardada en la fila,
 *   `orden` = siguiente al último vivo de la ficha (la principal no se pisa).
 * Idempotente: si ya existe una foto viva con el mismo (material_id, file_hash), la saltea.
 *
 * Herramienta LOCAL de mantenimiento para cargas en tanda: usa la service key del
 * backend y saltea las guardias de permisos. El camino normal es el botón 📷 del
 * catálogo (Certificaciones › Catálogo), que pasa por el backend.
 *
 * Uso: node scripts/subir-fotos-catalogo.mjs <plan.json> [--dry]
 *   plan.json = [{ "archivo": "/ruta/x.png", "material_id": 123, "descripcion": null }]
 */
import { createClient } from '/Users/francoleiro/cadincsrl/node_modules/@supabase/supabase-js/dist/main/index.js'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const env = Object.fromEntries(
  (await readFile('/Users/francoleiro/cadincsrl/.env', 'utf8'))
    .split('\n').filter(l => l.includes('=') && !l.trimStart().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const BUCKET = 'catalogo-fotos'
const CREATED_BY = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8' // Franco Leiro (admin)
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' }
const MIME_DE_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' }

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const plan = JSON.parse(await readFile(process.argv[2], 'utf8'))
const dry = process.argv.includes('--dry')

for (const it of plan) {
  const buf  = await readFile(it.archivo)
  const mime = MIME_DE_EXT[basename(it.archivo).split('.').pop().toLowerCase()]
  if (!mime) { console.log(`✗ ${basename(it.archivo)}: extensión no permitida`); continue }
  if (buf.length > 5 * 1024 * 1024) { console.log(`✗ ${basename(it.archivo)}: supera 5 MB`); continue }
  const hash = createHash('sha256').update(buf).digest('hex')

  const { data: dup } = await sb.from('stock_material_fotos').select('id')
    .eq('material_id', it.material_id).eq('file_hash', hash).is('deleted_at', null).maybeSingle()
  if (dup) { console.log(`= ficha ${it.material_id} ya tiene esta foto (id ${dup.id}), salteada`); continue }

  const { data: mat } = await sb.from('stock_materiales').select('id, nombre').eq('id', it.material_id).maybeSingle()
  if (!mat) { console.log(`✗ ficha ${it.material_id} no existe`); continue }

  const path = `material/${it.material_id}/${randomUUID()}.${EXT[mime]}`
  if (dry) { console.log(`~ [dry] ${basename(it.archivo)} → ${it.material_id} ${mat.nombre} (${path})`); continue }

  const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: false })
  if (up.error) { console.log(`✗ ${basename(it.archivo)}: subida falló — ${up.error.message}`); continue }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path)
  const { data: ult } = await sb.from('stock_material_fotos').select('orden')
    .eq('material_id', it.material_id).is('deleted_at', null)
    .order('orden', { ascending: false }).limit(1).maybeSingle()
  const orden = ult ? Number(ult.orden) + 1 : 0

  const { data: row, error } = await sb.from('stock_material_fotos').insert({
    material_id: it.material_id, storage_path: path, url: pub.publicUrl,
    file_hash: hash, descripcion: it.descripcion ?? null, orden, created_by: CREATED_BY,
  }).select('id, orden').single()

  if (error) {
    await sb.storage.from(BUCKET).remove([path]).catch(() => {})
    console.log(`✗ ${basename(it.archivo)}: insert falló — ${error.message}`)
  } else {
    console.log(`✓ ficha ${it.material_id} ${mat.nombre} → foto ${row.id} (orden ${row.orden})${row.orden === 0 ? ' PRINCIPAL' : ''}`)
  }
}
