-- Any picture or video format the phone or computer hands over is accepted;
-- the size limit stays at 50 MB.
update storage.buckets
  set allowed_mime_types = array['image/*', 'video/*']
  where id = 'media';
