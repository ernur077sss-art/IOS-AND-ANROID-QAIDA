-- Source-backed destinations in Abai Region. No unverified prices, schedules or coordinates.
insert into public.listings(id,title,city,category,summary,address,source_url,checked_at,origin,publication_status,out_of_city,verified_fields) values('00000000-0000-4000-8000-000000000107','Пещера Коныр-Аулие','semey','Природа','Коныр-Аулие (Қоңыр әулие) — пещера с подземным озером в горах Актас, Абайский район области Абай. Загородное направление рядом с селом Токтамыс. Перед поездкой уточните доступность спуска, состояние дороги, транспорт и условия посещения.','Область Абай, Абайский район, гора Актас, окрестности села Токтамыс','https://visitabay.kz/abai-zholy/82-konyr-aulie.html',now(),'real_verified','published',true,array['title','category','summary','address']) on conflict(id) do nothing;
insert into public.listings(id,title,city,category,summary,address,source_url,checked_at,origin,publication_status,out_of_city,verified_fields) values('00000000-0000-4000-8000-000000000108','Мавзолей Ыргызбай ата','semey','Наследие','Ыргызбай ата (Ырғызбай ата) — мавзолей и место паломничества, связанное с памятью Ыргызбая Досканаулы, в Аксуатском районе области Абай. Это отдельная загородная поездка. Транспорт, доступность комплекса и условия посещения уточняйте перед выездом.','Область Абай, Аксуатский район','https://visitabay.kz/pamjatniki-oblasti-abaj/109-aksuatskij-rajon.html',now(),'real_verified','published',true,array['title','category','summary','address']) on conflict(id) do nothing;

-- These two public programs explicitly mention Konyr-Aulie. This is not partner verification.
update public.providers
set listing_ids = array_append(listing_ids,'00000000-0000-4000-8000-000000000107'::uuid),version=version+1
where id in ('00000000-0000-4000-9000-000000000201','00000000-0000-4000-9000-000000000202')
  and owner_id is null
  and not ('00000000-0000-4000-8000-000000000107'::uuid=any(listing_ids));
