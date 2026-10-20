-- Directory references may omit unknown vehicle/capacity. Registered drivers still require both.
do $$declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.providers'::regclass and contype='c'
  and pg_get_constraintdef(oid) like '%vehicle%' and pg_get_constraintdef(oid) like '%seats%'
 loop execute format('alter table public.providers drop constraint %I',c.conname);end loop;
end$$;
alter table public.providers add constraint providers_driver_capacity
 check(kind<>'driver' or owner_id is null or (nullif(trim(vehicle),'') is not null and seats is not null));

-- Public business mobile on the operator's own route page; prices/departures remain unconfirmed.
update public.providers
set phone='+77773667905',checked_at=now(),version=version+1,
 description='На собственном сайте опубликован маршрут из Семея через Жидебай и Коныр-Аулие с транспортом и сопровождением экскурсовода. Контакт отдела внутреннего туризма. Актуальные даты, программу и цену уточняйте напрямую.'
where id='00000000-0000-4000-9000-000000000201' and owner_id is null;

insert into public.providers(id,kind,city,name,description,languages,phone,contact_url,source_url,checked_at,status,verified,listing_ids) values
('00000000-0000-4000-9000-000000000204','company','semey','Маршрут туриста',
'В опубликованной программе выезда из Семея в Коныр-Аулие указаны трансфер и сопровождение. Объявление относится к июлю 2026 года; ближайшие выезды, возможность индивидуальной поездки и стоимость нужно подтвердить у компании.',
'Уточнить','+77772957550','https://wa.me/77772957550','https://www.practicuma.online/events/22916/',now(),'published',false,array['00000000-0000-4000-8000-000000000107']::uuid[]),
('00000000-0000-4000-9000-000000000205','driver','semey','Такси Семей — Аксуат',
'В справочнике Servus опубликован контакт такси по маршруту Семей — Аксуат. Это вариант для запроса поездки в сторону Ыргызбай ата: прямой заезд к мавзолею, ожидание и обратную дорогу необходимо согласовать отдельно. Машина, вместимость, цена и выполнение поездки до мавзолея не подтверждены.',
'Уточнить','+77787736666','https://wa.me/77787736666','https://servus.kz/product/taxi-semei-aksuat/',now(),'published',false,array['00000000-0000-4000-8000-000000000108']::uuid[])
on conflict(id) do nothing;
