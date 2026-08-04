#!/bin/bash
# Setup script to install test dependencies
# Run this from within WSL: bash setup-tests.sh

echo "Installing test dependencies..."
npm install --save-dev jest@^29.7.0 supertest@^7.0.0 @types/jest@^29.5.14

echo "Test dependencies installed successfully!"
echo "You can now run tests with: npm test"
