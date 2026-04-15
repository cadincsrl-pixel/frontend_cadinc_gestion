alter table cert_materiales
  add column if not exists adjunto_url    text,
  add column if not exists adjunto_nombre text;
