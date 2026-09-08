# FEH Collection Tracker

Suivi de collection Fire Emblem Heroes — site statique.
Spec complète : `feh-collection-tracker-design.md`.

## Pipeline de données (Plan A)

Régénérer le catalogue localement :

    node scripts/fetch-heroes.mjs

Lancer les tests :

    node --test
