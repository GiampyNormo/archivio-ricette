# 🍳 Archivio Ricette

Archivio locale delle ricette di casa. I dati restano sul tuo Mac: nessun account, nessun cloud.

## Avviare

Doppio click su **`avvia.command`** — parte il server e si apre il browser.

Da terminale, in alternativa:

```bash
python3 server.py
```

- Su questo Mac → <http://localhost:8790>
- Dal telefono (stessa Wi-Fi) → l'indirizzo `http://192.168.x.x:8790` che compare all'avvio

Chi è collegato alla tua rete può aprire l'archivio e modificarlo. Per chiuderlo solo a questo computer:
`python3 server.py --local`

## Usare

| Azione | Come |
|---|---|
| Nuova ricetta | Bottone **Nuova ricetta** (o tasto `N`) |
| Aprire una ricetta | Click sulla card |
| Modificare / eliminare | Icona ✏️ dentro la ricetta aperta |
| Preferite | ☆ sulla card o nel dettaglio |
| Cercare | Campo in alto (o tasto `/`) — cerca in nome, ingredienti, passaggi |
| Filtrare | Chip dei tag: più tag dello **stesso gruppo** = OR, gruppi **diversi** = AND |
| Spuntare gli ingredienti | Click sulla riga mentre cucini |
| Chiudere | `Esc` o click fuori |

**Foto**: trascina un file sul riquadro, cliccalo per scegliere dal Mac, oppure incolla con `⌘V`.
Le immagini vengono rimpicciolite prima del salvataggio, così l'archivio resta leggero.

**Ingredienti e procedimento**: `Invio` crea la riga successiva, `Backspace` su una riga vuota la cancella.
Con **Incolla lista** puoi buttare dentro tutto un elenco copiato da un sito e viene diviso riga per riga.

## Aggiungere tag

Per ora c'è un tag solo, **Proteico**: la lista vera arriva quando l'hai decisa.

I tag stanno nel server, non nell'interfaccia: quando inserisci una ricetta puoi solo sceglierli
dall'elenco, mai crearne di nuovi. Per aggiungerne uno apri `server.py`, cerca il blocco
`TAG_GROUPS` (in cima al file, ben segnalato) e aggiungi una riga al gruppo giusto:

```python
("id-univoco", "Etichetta visibile"),
```

L'`id` non va più cambiato una volta usato — è quello salvato dentro le ricette.
L'etichetta invece si può riscrivere quando vuoi. Riavvia il server e il tag compare
sia nei filtri sia nel form.

Per un gruppo nuovo, copia un blocco intero e cambia `id`, `label`, `color`, `icon`.

## File

```
server.py        server + elenco dei tag
web/             interfaccia (html, css, js)
recipes.json     le ricette          ← il file da salvare se fai un backup
recipes.bak.json copia automatica della versione precedente
images/          le foto
```

Ricette e foto restano solo sul tuo Mac: `.gitignore` le tiene fuori dal repository.

```
```

## Prossimo passo

Il calendario settimanale non c'è ancora, ma il posto è già segnato in fondo alla pagina:
le ricette hanno id stabili, quindi un piano dei pasti potrà agganciarsi senza toccare l'archivio.
