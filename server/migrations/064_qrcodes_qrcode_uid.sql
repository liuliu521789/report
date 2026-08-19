-- 二维码业务编号：QR-年份-6位序号（如 QR-2026-000001）

ALTER TABLE qrcodes ADD COLUMN qrcode_uid VARCHAR(32) NULL COMMENT '二维码业务编号' AFTER token;

ALTER TABLE qrcodes ADD UNIQUE KEY uk_qrcodes_qrcode_uid (qrcode_uid);
