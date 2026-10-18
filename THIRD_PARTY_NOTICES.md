# Attribution

Ce serveur utilise le paquet npm `howlongtobeat@1.8.0` de Christian Katzorke,
issu de [ckatzorke/howlongtobeat](https://github.com/ckatzorke/howlongtobeat).
Le fichier demandé et examiné est
[`src/main/howlongtobeat.ts`](https://github.com/ckatzorke/howlongtobeat/blob/d57da96a95f16ee89959cad8fa30907a0504040f/src/main/howlongtobeat.ts).
La bibliothèque est utilisée comme dépendance, sans recopie de son source.
Son code est sous [WTFPL v2](https://github.com/ckatzorke/howlongtobeat/blob/d57da96a95f16ee89959cad8fa30907a0504040f/LICENSE).
Le paquet publié n'est pas identique à la branche master : il dépend encore
d'Axios 0.22. Ce serveur impose Axios 1.x via `overrides`; la version exacte
est verrouillée dans `package-lock.json` et testée avec un serveur HTTP local.

Le code propre au serveur MCP est sous MIT. Les autres dépendances conservent
leurs licences respectives, disponibles dans leurs paquets npm.

Projet non officiel, sans affiliation avec HowLongToBeat, Claude ou OpenAI.
Les données et marques restent la propriété de leurs titulaires.
