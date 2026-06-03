delete from public.sticker_assets
where storage_path ~* '(^|/)source\.webp$';
