#!/bin/bash

glib-compile-schemas --strict schemas
rm -f extension.zip
zip -r extension.zip schemas/ *.js metadata.json LICENSE README.md
