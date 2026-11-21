# manifest must NOT mark the unextracted docs as seen (partial-update trap)
files={k:[f for f in v if f not in deferred_docs] for k,v in r.get('files',{}).items()}
r['files']=files
...
git add -- $(echo $F) && git commit -q --only -F -