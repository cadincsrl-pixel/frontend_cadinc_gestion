-- Proveedor de referencia en materiales de stock
alter table stock_materiales
  add column if not exists proveedor_id int references proveedores(id);

-- Obra depósito: flag para identificar la obra que es el depósito
alter table obras
  add column if not exists es_deposito boolean not null default false;

-- Marcar la obra DEPOSITO (ajustar el cod si es diferente)
update obras set es_deposito = true where upper(nom) like '%DEPOSITO%' or upper(cod) like '%DEPOSITO%';
