-- Datos bancarios del chofer para armar solicitudes de transferencia.
-- Ambos opcionales: en Argentina una transferencia se puede direccionar por
-- alias O por CBU/CVU, así que guardamos los dos y en el txt mostramos el que
-- esté cargado. No son sensibles a nivel financiero (no permiten mover plata),
-- así que van como columnas planas en choferes (no como documento adjunto).
ALTER TABLE choferes ADD COLUMN IF NOT EXISTS alias text;
ALTER TABLE choferes ADD COLUMN IF NOT EXISTS cbu   text;
