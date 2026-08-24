#!/bin/bash

rm -f extension.zip
zip -r extension.zip schemas/*.xml *.js metadata.json LICENSE README.md
