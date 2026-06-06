#!/usr/bin/env python3
import os
import argparse
import bcrypt
import psycopg2

from dotenv import load_dotenv

load_dotenv()

def get_db_conn():
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return psycopg2.connect(database_url)

    db_user = os.getenv("POSTGRES_USER", "postgres")
    db_password = os.getenv("POSTGRES_PASSWORD", "pastibisa")
    db_host = os.getenv("POSTGRES_HOST", "localhost")
    db_port = os.getenv("POSTGRES_PORT", "5433")
    db_name = os.getenv("POSTGRES_DB", "epson_qc")
    return psycopg2.connect(host=db_host, port=int(db_port), dbname=db_name, user=db_user, password=db_password)


def add_user(username: str, password: str, role: str):
    pw_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    conn = get_db_conn()
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s) RETURNING id;", (username, pw_hash, role))
    new_id = cur.fetchone()[0]
    cur.close()
    conn.close()
    return new_id


def main():
    p = argparse.ArgumentParser(description="Add a user to the Epson QC database")
    p.add_argument("username")
    p.add_argument("password")
    p.add_argument("--role", default="operator", choices=["operator", "supervisor", "manager"], help="User role")
    args = p.parse_args()

    nid = add_user(args.username, args.password, args.role)
    print(f"Inserted user id={nid}")


if __name__ == "__main__":
    main()
