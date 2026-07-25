ALTER TABLE moderation.reviews ALTER COLUMN buyer_id DROP NOT NULL;
ALTER TABLE moderation.reports ALTER COLUMN reporter_id DROP NOT NULL;
ALTER TABLE moderation.admin_actions ALTER COLUMN admin_id DROP NOT NULL;
