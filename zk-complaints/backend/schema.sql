CREATE DATABASE IF NOT EXISTS zk_complaints;
USE zk_complaints;
CREATE TABLE IF NOT EXISTS admins (id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(120) UNIQUE NOT NULL, password_hash VARCHAR(100) NOT NULL);
CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY, student_id VARCHAR(30) UNIQUE NOT NULL, name VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL, department VARCHAR(50), year TINYINT, status ENUM('active','inactive') DEFAULT 'active',
  commitment VARCHAR(80) UNIQUE NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS complaints (
  id INT AUTO_INCREMENT PRIMARY KEY, complaint_code VARCHAR(20) UNIQUE NOT NULL,
  category VARCHAR(30) NOT NULL, title VARCHAR(150) NOT NULL, description TEXT NOT NULL,
  priority ENUM('Low','Medium','High') NOT NULL, proof JSON NOT NULL, public_signals JSON NOT NULL,
  merkle_root VARCHAR(80) NOT NULL, nullifier VARCHAR(80) UNIQUE NOT NULL,
  status ENUM('Pending','Under Investigation','Resolved','Rejected') DEFAULT 'Pending',
  admin_remark TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);
-- No student columns exist in complaints: complaints are unlinkable to students by design.
