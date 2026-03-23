-- MySQL dump 10.13  Distrib 8.0.30, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: qc_report
-- ------------------------------------------------------
-- Server version	8.0.30

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `company_settings`
--

DROP TABLE IF EXISTS `company_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `company_settings` (
  `id` tinyint unsigned NOT NULL DEFAULT '1',
  `company_name_zh` varchar(128) NOT NULL DEFAULT '',
  `company_name_en` varchar(256) NOT NULL DEFAULT '',
  `report_title_zh` varchar(128) NOT NULL DEFAULT '',
  `report_title_en` varchar(256) NOT NULL DEFAULT '',
  `description_zh` varchar(256) DEFAULT NULL,
  `description_en` varchar(256) DEFAULT NULL,
  `logo_url` varchar(512) DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `fk_company_settings_created_by` (`created_by`),
  CONSTRAINT `fk_company_settings_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `company_settings`
--

LOCK TABLES `company_settings` WRITE;
/*!40000 ALTER TABLE `company_settings` DISABLE KEYS */;
INSERT INTO `company_settings` VALUES (1,'开封物源化工有限公司','Kaifeng Wuyuan Chemical Industry Co., Ltd','产品质量检验报告单','Certificate of Analysis','卓越品质 用心服务','','http://localhost:3001/uploads/company/company_logo_1773991966429_7KRDf-Sh.png',1,'2026-03-20 15:36:47.679','2026-03-21 10:33:30.298');
/*!40000 ALTER TABLE `company_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `company_stamps`
--

DROP TABLE IF EXISTS `company_stamps`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `company_stamps` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(128) NOT NULL,
  `seal_type` enum('department_qc','inspector','supervisor','pass','recheck') NOT NULL DEFAULT 'department_qc',
  `image_url` varchar(512) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_company_stamps_active` (`is_active`),
  KEY `idx_company_stamps_type_active` (`seal_type`,`is_active`),
  KEY `fk_company_stamps_created_by` (`created_by`),
  CONSTRAINT `fk_company_stamps_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `company_stamps`
--

LOCK TABLES `company_stamps` WRITE;
/*!40000 ALTER TABLE `company_stamps` DISABLE KEYS */;
INSERT INTO `company_stamps` VALUES (1,'质检章','department_qc','http://localhost:3001/uploads/stamps/stamp_1773992244154_mla-M0wG.png',1,1,'2026-03-20 15:37:26.882'),(2,'FQC01','inspector','http://localhost:3001/uploads/stamps/stamp_1773992284119_EQ96ZM1X.png',1,1,'2026-03-20 15:38:06.505'),(3,'OQC02','supervisor','http://localhost:3001/uploads/stamps/stamp_1773992311070_RSzGJyCh.png',1,1,'2026-03-20 15:38:33.128'),(4,'复检章','recheck','http://localhost:3001/uploads/stamps/stamp_1774057507751_t0x4nGZ6.png',1,1,'2026-03-21 09:45:31.235'),(5,'合格章','pass','http://localhost:3001/uploads/stamps/stamp_1774057556423_UJkmOj7e.png',1,1,'2026-03-21 09:45:58.355');
/*!40000 ALTER TABLE `company_stamps` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `qrcode_reports`
--

DROP TABLE IF EXISTS `qrcode_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `qrcode_reports` (
  `qrcode_id` bigint unsigned NOT NULL,
  `report_id` bigint unsigned NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`qrcode_id`,`report_id`),
  KEY `idx_qrcode_reports_report` (`report_id`),
  CONSTRAINT `fk_qrcode_reports_qrcode` FOREIGN KEY (`qrcode_id`) REFERENCES `qrcodes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_qrcode_reports_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `qrcode_reports`
--

LOCK TABLES `qrcode_reports` WRITE;
/*!40000 ALTER TABLE `qrcode_reports` DISABLE KEYS */;
INSERT INTO `qrcode_reports` VALUES (1,1,'2026-03-20 16:18:48.078'),(2,1,'2026-03-21 10:28:11.234'),(3,1,'2026-03-21 10:29:53.498'),(4,2,'2026-03-21 13:14:08.424'),(5,1,'2026-03-21 13:15:25.811'),(5,2,'2026-03-21 13:15:25.811');
/*!40000 ALTER TABLE `qrcode_reports` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `qrcodes`
--

DROP TABLE IF EXISTS `qrcodes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `qrcodes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `token` varchar(64) NOT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_qrcodes_token` (`token`),
  KEY `fk_qrcodes_created_by` (`created_by`),
  CONSTRAINT `fk_qrcodes_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `qrcodes`
--

LOCK TABLES `qrcodes` WRITE;
/*!40000 ALTER TABLE `qrcodes` DISABLE KEYS */;
INSERT INTO `qrcodes` VALUES (1,'QTfZ2aBQcJEUUqEulcTLrU2d',1,'2026-03-20 16:18:47.984'),(2,'HLdnP1MdGsYdTB_Vv343Wy7u',1,'2026-03-21 10:28:11.230'),(3,'J-_WDF-vlnt4wrBjMHeEIpt5',1,'2026-03-21 10:29:53.497'),(4,'1baslkZhYG0yp17u68gcOx4w',1,'2026-03-21 13:14:08.414'),(5,'wZAFbE0atYfmrL2xxRaJlcqb',1,'2026-03-21 13:15:25.781');
/*!40000 ALTER TABLE `qrcodes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `report_fields`
--

DROP TABLE IF EXISTS `report_fields`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_fields` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `report_id` bigint unsigned NOT NULL,
  `field_key` varchar(64) NOT NULL,
  `field_label` varchar(128) NOT NULL,
  `field_label_en` varchar(128) DEFAULT NULL,
  `field_type` varchar(16) NOT NULL,
  `field_value_json` json DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_report_fields_report_key` (`report_id`,`field_key`),
  KEY `idx_report_fields_report_sort` (`report_id`,`sort_order`),
  CONSTRAINT `fk_report_fields_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=56 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `report_fields`
--

LOCK TABLES `report_fields` WRITE;
/*!40000 ALTER TABLE `report_fields` DISABLE KEYS */;
INSERT INTO `report_fields` VALUES (42,2,'product_name','产品名称','Product Name','text','{\"en\": \"NL9213-70A\", \"zh\": \"NL9213-70A\"}',10,'2026-03-21 13:54:00.337','2026-03-21 13:54:00.337'),(43,2,'packing','包装规格','Packing','text','{\"en\": \"200kg/桶\", \"zh\": \"200kg/桶\"}',20,'2026-03-21 13:54:00.338','2026-03-21 13:54:00.338'),(44,2,'batch_weight','本批数量','Batch Weight','text','{\"en\": \"13400kg\", \"zh\": \"13400kg\"}',30,'2026-03-21 13:54:00.338','2026-03-21 13:54:00.338'),(45,2,'batch_no','生产批号','Batch No.','text','{\"en\": \"202603143\", \"zh\": \"202603143\"}',40,'2026-03-21 13:54:00.338','2026-03-21 13:54:00.338'),(46,2,'analysis_date','检验日期','Analysis Date','text','{\"en\": \"2026-3-20\", \"zh\": \"2026-3-20\"}',50,'2026-03-21 13:54:00.339','2026-03-21 13:54:00.339'),(47,2,'ex_mill_date','出厂日期','EX-mill Date','text','{\"en\": \"2026-3-20\", \"zh\": \"2026-3-20\"}',60,'2026-03-21 13:54:00.339','2026-03-21 13:54:00.339'),(48,2,'inspection_table','检测项目表','Inspection items','table','{\"rows\": [{\"item\": {\"en\": \"Appearance\", \"zh\": \"外观\"}, \"unit\": {\"en\": \"-\", \"zh\": \"-\"}, \"result\": {\"en\": \"透明\", \"zh\": \"透明\"}, \"standard\": {\"en\": \"Transparent\", \"zh\": \"透明\"}}, {\"item\": {\"en\": \"Color(Fe-Co)\", \"zh\": \"色度\"}, \"unit\": {\"en\": \"#\", \"zh\": \"#\"}, \"result\": {\"en\": \"\", \"zh\": \"\"}, \"standard\": {\"en\": \"≤3\", \"zh\": \"≤3\"}}, {\"item\": {\"en\": \"Solidity\", \"zh\": \"固体份\"}, \"unit\": {\"en\": \"%\", \"zh\": \"%\"}, \"result\": {\"en\": \"\", \"zh\": \"\"}, \"standard\": {\"en\": \"68-72\", \"zh\": \"68-72\"}}, {\"item\": {\"en\": \"Viscosity\", \"zh\": \"粘度\"}, \"unit\": {\"en\": \"s\", \"zh\": \"s\"}, \"result\": {\"en\": \"\", \"zh\": \"\"}, \"standard\": {\"en\": \"450-650\", \"zh\": \"450-650\"}}, {\"item\": {\"en\": \"Acid value\", \"zh\": \"酸值\"}, \"unit\": {\"en\": \"mgKOH/g\", \"zh\": \"mgKOH/g\"}, \"result\": {\"en\": \"\", \"zh\": \"\"}, \"standard\": {\"en\": \"≤10\", \"zh\": \"≤10\"}}], \"columnLabels\": [{\"en\": \"Test item\", \"zh\": \"检验项目\"}, {\"en\": \"Unit\", \"zh\": \"单位\"}, {\"en\": \"Normal value\", \"zh\": \"标准值\"}, {\"en\": \"Test value\", \"zh\": \"检测值\"}]}',70,'2026-03-21 13:54:00.339','2026-03-21 13:54:00.339'),(49,2,'test_conclusion','检验结论','Test conclusion','text','{\"en\": \"\", \"zh\": \"\"}',80,'2026-03-21 13:54:00.339','2026-03-21 13:54:00.339'),(50,2,'remarks','备注','Remarks','text','{\"en\": \"\", \"zh\": \"\"}',90,'2026-03-21 13:54:00.340','2026-03-21 13:54:00.340'),(51,1,'product_name','产品名称','Product Name','text','{\"en\": \"juyixi\", \"zh\": \"聚乙烯\"}',10,'2026-03-21 14:36:50.370','2026-03-21 14:36:50.370'),(52,1,'batch_no','生产批号','Batch No.','text','{\"en\": \"20250206\", \"zh\": \"20250206\"}',40,'2026-03-21 14:36:50.373','2026-03-21 14:36:50.373'),(53,1,'inspection_table','检测项目表','Inspection items','table','{\"rows\": [{\"item\": {\"en\": \"Appearance\", \"zh\": \"外观\"}, \"unit\": {\"en\": \"-\", \"zh\": \"-\"}, \"result\": {\"en\": \"\", \"zh\": \"\"}, \"standard\": {\"en\": \"Transparent\", \"zh\": \"透明\"}}, {\"item\": {\"en\": \"Color(Fe-Co)\", \"zh\": \"色度\"}, \"unit\": {\"en\": \"#\", \"zh\": \"#\"}, \"result\": {\"en\": \"\", \"zh\": \"\"}, \"standard\": {\"en\": \"≤3\", \"zh\": \"≤3\"}}, {\"item\": {\"en\": \"Solidity\", \"zh\": \"固体份\"}, \"unit\": {\"en\": \"%\", \"zh\": \"%\"}, \"result\": {\"en\": \"\", \"zh\": \"\"}, \"standard\": {\"en\": \"68-72\", \"zh\": \"68-72\"}}, {\"item\": {\"en\": \"Viscosity\", \"zh\": \"粘度\"}, \"unit\": {\"en\": \"s\", \"zh\": \"s\"}, \"result\": {\"en\": \"\", \"zh\": \"\"}, \"standard\": {\"en\": \"450-650\", \"zh\": \"450-650\"}}, {\"item\": {\"en\": \"Acid value\", \"zh\": \"酸值\"}, \"unit\": {\"en\": \"mgKOH/g\", \"zh\": \"mgKOH/g\"}, \"result\": {\"en\": \"\", \"zh\": \"\"}, \"standard\": {\"en\": \"≤10\", \"zh\": \"≤10\"}}], \"columnLabels\": [{\"en\": \"Test item\", \"zh\": \"检验项目\"}, {\"en\": \"Unit\", \"zh\": \"单位\"}, {\"en\": \"Normal value\", \"zh\": \"标准值\"}, {\"en\": \"Test value\", \"zh\": \"检测值\"}]}',70,'2026-03-21 14:36:50.374','2026-03-21 14:36:50.374'),(54,1,'test_conclusion','检验结论','Test conclusion','text','{\"en\": \"\", \"zh\": \"\"}',80,'2026-03-21 14:36:50.374','2026-03-21 14:36:50.374'),(55,1,'remarks','备注','Remarks','text','{\"en\": \"\", \"zh\": \"\"}',90,'2026-03-21 14:36:50.375','2026-03-21 14:36:50.375');
/*!40000 ALTER TABLE `report_fields` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `report_seals`
--

DROP TABLE IF EXISTS `report_seals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_seals` (
  `report_id` bigint unsigned NOT NULL,
  `seal_type` enum('department_qc','inspector','supervisor','pass','recheck') NOT NULL,
  `seal_name` varchar(128) NOT NULL,
  `seal_image_url` varchar(512) NOT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`report_id`,`seal_type`),
  CONSTRAINT `fk_report_seals_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `report_seals`
--

LOCK TABLES `report_seals` WRITE;
/*!40000 ALTER TABLE `report_seals` DISABLE KEYS */;
INSERT INTO `report_seals` VALUES (1,'department_qc','质检章','http://localhost:3001/uploads/stamps/stamp_1773992244154_mla-M0wG.png',1,'2026-03-21 10:27:46.193'),(1,'inspector','FQC01','http://localhost:3001/uploads/stamps/stamp_1773992284119_EQ96ZM1X.png',1,'2026-03-21 10:27:51.829'),(1,'supervisor','OQC02','http://localhost:3001/uploads/stamps/stamp_1773992311070_RSzGJyCh.png',1,'2026-03-21 10:27:52.783'),(1,'pass','合格章','http://localhost:3001/uploads/stamps/stamp_1774057556423_UJkmOj7e.png',1,'2026-03-21 10:27:53.904'),(1,'recheck','复检章','http://localhost:3001/uploads/stamps/stamp_1774057507751_t0x4nGZ6.png',1,'2026-03-21 10:27:54.522'),(2,'department_qc','质检章','http://localhost:3001/uploads/stamps/stamp_1773992244154_mla-M0wG.png',1,'2026-03-21 13:53:49.315'),(2,'inspector','FQC01','http://localhost:3001/uploads/stamps/stamp_1773992284119_EQ96ZM1X.png',1,'2026-03-21 13:53:52.000'),(2,'supervisor','OQC02','http://localhost:3001/uploads/stamps/stamp_1773992311070_RSzGJyCh.png',1,'2026-03-21 13:53:53.729'),(2,'pass','合格章','http://localhost:3001/uploads/stamps/stamp_1774057556423_UJkmOj7e.png',1,'2026-03-21 13:53:54.872'),(2,'recheck','复检章','http://localhost:3001/uploads/stamps/stamp_1774057507751_t0x4nGZ6.png',1,'2026-03-21 13:53:56.031');
/*!40000 ALTER TABLE `report_seals` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `report_template_fields`
--

DROP TABLE IF EXISTS `report_template_fields`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_template_fields` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `template_id` bigint unsigned NOT NULL,
  `field_key` varchar(64) NOT NULL,
  `field_label` varchar(128) NOT NULL,
  `field_label_en` varchar(128) DEFAULT NULL,
  `field_type` varchar(16) NOT NULL,
  `default_value_json` json DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_template_fields_tpl_key` (`template_id`,`field_key`),
  KEY `idx_template_fields_tpl_sort` (`template_id`,`sort_order`),
  CONSTRAINT `fk_template_fields_tpl` FOREIGN KEY (`template_id`) REFERENCES `report_templates` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `report_template_fields`
--

LOCK TABLES `report_template_fields` WRITE;
/*!40000 ALTER TABLE `report_template_fields` DISABLE KEYS */;
INSERT INTO `report_template_fields` VALUES (1,1,'product_name','产品名称','Product Name','text','{\"en\": \"NL9213-70A\", \"zh\": \"NL9213-70A\"}',10,'2026-03-21 13:17:34.274','2026-03-21 13:17:34.274'),(2,1,'packing','包装规格','Packing','text','{\"en\": \"200kg/桶\", \"zh\": \"200kg/桶\"}',20,'2026-03-21 13:17:34.352','2026-03-21 13:17:34.352'),(3,1,'batch_weight','本批数量','Batch Weight','text','{\"en\": \"13400kg\", \"zh\": \"13400kg\"}',30,'2026-03-21 13:17:34.353','2026-03-21 13:17:34.353'),(4,1,'batch_no','生产批号','Batch No.','text','{\"en\": \"202603143\", \"zh\": \"202603143\"}',40,'2026-03-21 13:17:34.353','2026-03-21 13:17:34.353'),(5,1,'analysis_date','检验日期','Analysis Date','text','{\"en\": \"2026-3-20\", \"zh\": \"2026-3-20\"}',50,'2026-03-21 13:17:34.354','2026-03-21 13:17:34.354'),(6,1,'ex_mill_date','出厂日期','EX-mill Date','text','{\"en\": \"2026-3-20\", \"zh\": \"2026-3-20\"}',60,'2026-03-21 13:17:34.354','2026-03-21 13:17:34.354'),(7,1,'inspection_table','检测项目表','Inspection items','table','{\"rows\": [{\"item\": {\"en\": \"Appearance\", \"zh\": \"外观\"}, \"unit\": {\"en\": \"-\", \"zh\": \"-\"}, \"result\": {\"en\": \"透明\", \"zh\": \"透明\"}, \"standard\": {\"en\": \"Transparent\", \"zh\": \"透明\"}}, {\"item\": {\"en\": \"Color(Fe-Co)\", \"zh\": \"色度\"}, \"unit\": {\"en\": \"#\", \"zh\": \"#\"}, \"result\": {\"en\": \"\", \"zh\": \"\"}, \"standard\": {\"en\": \"≤3\", \"zh\": \"≤3\"}}, {\"item\": {\"en\": \"Solidity\", \"zh\": \"固体份\"}, \"unit\": {\"en\": \"%\", \"zh\": \"%\"}, \"result\": {\"en\": \"\", \"zh\": \"\"}, \"standard\": {\"en\": \"68-72\", \"zh\": \"68-72\"}}, {\"item\": {\"en\": \"Viscosity\", \"zh\": \"粘度\"}, \"unit\": {\"en\": \"s\", \"zh\": \"s\"}, \"result\": {\"en\": \"\", \"zh\": \"\"}, \"standard\": {\"en\": \"450-650\", \"zh\": \"450-650\"}}, {\"item\": {\"en\": \"Acid value\", \"zh\": \"酸值\"}, \"unit\": {\"en\": \"mgKOH/g\", \"zh\": \"mgKOH/g\"}, \"result\": {\"en\": \"\", \"zh\": \"\"}, \"standard\": {\"en\": \"≤10\", \"zh\": \"≤10\"}}], \"columnLabels\": [{\"en\": \"Test item\", \"zh\": \"检验项目\"}, {\"en\": \"Unit\", \"zh\": \"单位\"}, {\"en\": \"Normal value\", \"zh\": \"标准值\"}, {\"en\": \"Test value\", \"zh\": \"检测值\"}]}',70,'2026-03-21 13:17:34.354','2026-03-21 13:17:34.354'),(8,1,'test_conclusion','检验结论','Test conclusion','text','{\"en\": \"\", \"zh\": \"\"}',80,'2026-03-21 13:17:34.355','2026-03-21 13:17:34.355'),(9,1,'remarks','备注','Remarks','text','{\"en\": \"\", \"zh\": \"\"}',90,'2026-03-21 13:17:34.355','2026-03-21 13:17:34.355');
/*!40000 ALTER TABLE `report_template_fields` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `report_templates`
--

DROP TABLE IF EXISTS `report_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_templates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(128) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_report_templates_name` (`name`),
  KEY `fk_report_templates_created_by` (`created_by`),
  CONSTRAINT `fk_report_templates_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `report_templates`
--

LOCK TABLES `report_templates` WRITE;
/*!40000 ALTER TABLE `report_templates` DISABLE KEYS */;
INSERT INTO `report_templates` VALUES (1,'NL9213-70A','NL9213-70A',1,'2026-03-21 13:17:34.274','2026-03-21 13:17:34.274');
/*!40000 ALTER TABLE `report_templates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reports`
--

DROP TABLE IF EXISTS `reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reports` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `report_no` varchar(64) NOT NULL,
  `batch_no` varchar(64) DEFAULT NULL,
  `batch_no_en` varchar(128) DEFAULT NULL,
  `product_name` varchar(128) NOT NULL,
  `product_name_en` varchar(128) DEFAULT NULL,
  `template_id` bigint unsigned DEFAULT NULL,
  `conclusion` enum('pass','fail','unknown') NOT NULL DEFAULT 'unknown',
  `status` enum('active','void') NOT NULL DEFAULT 'active',
  `created_by` bigint unsigned DEFAULT NULL,
  `updated_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_reports_report_no` (`report_no`),
  KEY `idx_reports_batch_no` (`batch_no`),
  KEY `idx_reports_status` (`status`),
  KEY `idx_reports_template_id` (`template_id`),
  KEY `fk_reports_created_by` (`created_by`),
  KEY `fk_reports_updated_by` (`updated_by`),
  CONSTRAINT `fk_reports_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reports`
--

LOCK TABLES `reports` WRITE;
/*!40000 ALTER TABLE `reports` DISABLE KEYS */;
INSERT INTO `reports` VALUES (1,'20250206','20250206','20250206','聚乙烯','juyixi',NULL,'pass','void',1,1,'2026-03-20 16:18:40.778','2026-03-21 14:43:06.709'),(2,'JL-8-8-0','202603143','202603143','NL9213-70A','NL9213-70A',NULL,'pass','active',1,1,'2026-03-21 13:12:18.967','2026-03-21 13:12:58.962');
/*!40000 ALTER TABLE `reports` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(64) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('admin','inspector') NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'admin','pbkdf2_sha256$120000$134af6457b7a809a54b053046cf0c857$d058bb2f86f6248109c8298a522aa9c58040e0105052e8bf76cae5a0e5b04bcd','admin',1,'2026-03-20 15:32:08.593','2026-03-20 15:32:08.593'),(2,'jy001','pbkdf2_sha256$120000$ab4f617092bcad0e2336e444045ca191$391c51140989f1898f22afc7c7bf8c318565ded00bdfc71de57f1289538f6933','inspector',1,'2026-03-21 15:30:26.300','2026-03-21 15:30:26.300');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'qc_report'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-03-21 16:17:02
