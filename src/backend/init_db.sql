CREATE DATABASE IF NOT EXISTS dhirstra;
USE dhirstra;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  dpr VARCHAR(255) DEFAULT NULL,
  reason TEXT DEFAULT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dpr_analysis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  file_path VARCHAR(255) UNIQUE,
  analysis_data LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ministry_decisions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  file_path VARCHAR(255) UNIQUE,
  decision VARCHAR(20),
  reason TEXT,
  decided_by VARCHAR(100),
  decided_by_role VARCHAR(100),
  decided_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_status (
  id INT AUTO_INCREMENT PRIMARY KEY,
  file_path VARCHAR(255) UNIQUE,
  dpr_name VARCHAR(255),
  title TEXT,
  location VARCHAR(255),
  budget VARCHAR(100),
  duration VARCHAR(100),
  agency TEXT,
  spec VARCHAR(255),
  nodal_status VARCHAR(50) DEFAULT 'Pending',
  nodal_forwarded_at TIMESTAMP NULL,
  nodal_rejected_at TIMESTAMP NULL,
  nodal_reject_reason TEXT,
  ministry_decision VARCHAR(20) DEFAULT NULL,
  ministry_decided_by VARCHAR(100),
  ministry_decided_by_role VARCHAR(100),
  ministry_decided_at TIMESTAMP NULL,
  ministry_reject_reason TEXT,
  slec_progress INT DEFAULT 0,
  slec_impl_status VARCHAR(50) DEFAULT 'Not Started',
  slec_timeline_compliance VARCHAR(50) DEFAULT 'Under Review',
  slec_quality_compliance VARCHAR(50) DEFAULT 'Under Review',
  slec_om_compliance VARCHAR(50) DEFAULT 'Under Review',
  slec_remarks TEXT,
  slec_updated_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
