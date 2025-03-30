#!/bin/bash

# Remove sensitive files from git history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch \
  .env \
  .env.* \
  *.env \
  *.pem \
  *.key \
  *.cert \
  *.crt \
  config/secrets.* \
  config/database.* \
  sessions/* \
  uploads/* \
  media/*" \
  --prune-empty --tag-name-filter cat -- --all

# Force garbage collection
git for-each-ref --format='delete %(refname)' refs/original | git update-ref --stdin
git reflog expire --expire=now --all
git gc --prune=now --aggressive
