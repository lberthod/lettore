// Bucket une clé (lemme ou forme fléchie) sur son initiale (a-z, ou "_" pour
// tout le reste) — utilisé à la fois par le frontend (chargement des shards
// à la demande) et par les scripts Node de génération (écriture des shards).
export function shardKey(str) {
  const c = str.normalize('NFC').trim().charAt(0).toLowerCase()
  return /[a-z]/.test(c) ? c : '_'
}
