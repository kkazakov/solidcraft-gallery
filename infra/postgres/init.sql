-- Runs once on an empty data directory.
CREATE USER forgejo WITH PASSWORD 'forgejo';
CREATE DATABASE forgejo OWNER forgejo;
