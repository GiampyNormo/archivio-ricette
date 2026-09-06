# 🍳 Archivio Ricette

Archivio delle ricette di casa. Vive in due forme, con lo stesso codice:

| | Dove | Cosa puoi fare |
|---|---|---|
| **Archivio** | server sul Mac | aggiungi, modifichi, elimini, carichi foto |
| **Sfoglia** | GitHub Pages | apri il link da qualsiasi telefono e leggi, anche fuori casa |

Il flusso è: **scrivi sul Mac → pubblichi → sfogli ovunque.**

> Sul link non c'è il tasto **Nuova ricetta**: è voluto, lì si legge soltanto.
> Per aggiungere ricette apri l'archivio sul Mac. Se il Mac è acceso e sei in casa,
> dal telefono puoi aprire il suo indirizzo `192.168.x.x:8790` e hai l'app completa,
> tasto compreso.

## Scrivere (sul Mac)

Doppio click su **`avvia.command`**. Da terminale: `python3 server.py`.

- Qui → <http://localhost:8790>
- Dal telefono in Wi-Fi → l'indirizzo `192.168.x.x:8790` stampato all'avvio (versione completa, scrittura inclusa)
- Solo questo computer → `python3 server.py --local`

## Pubblicare

Doppio click su **`pubblica.command`**: manda online le ricette nuove e ti ristampa il link.
Passa un minuto o due prima che il sito si aggiorni.

## Usare

| Azione | Come |
|---|---|
| Nuova ricetta | Bottone **Nuova ricetta** (o tasto `N`) |
| Aprire una ricetta | Click sulla card |
| Modificare / eliminare | Icona ✏️ dentro la ricetta aperta |
| Preferite | ☆ sulla card o nel dettaglio |
| Cercare | Campo in alto (o tasto `/`) — cerca in nome, ingredienti, passaggi |
| Filtrare | Chip dei tag: più tag dello **stesso gruppo** = OR, gruppi **diversi** = AND |
| Spuntare gli ingredienti | Click sulla riga mentre cucini (funziona anche dal telefono) |
| Chiudere | `Esc` o click fuori |

**Foto**: trascina un file sul riquadro, cliccalo per scegliere dal Mac, oppure incolla con `⌘V`.
Vengono rimpicciolite prima del salvataggio, così l'archivio resta leggero.

**Ingredienti e procedimento**: `Invio` crea la riga successiva, `Backspace` su una riga vuota la cancella.
Con **Incolla lista** puoi buttare dentro un elenco copiato da un sito e viene diviso riga per riga.

## Aggiungere tag

Per ora c'è un tag solo, **Proteico**: la lista vera arriva quando l'hai decisa.

I tag stanno nel server, non nell'interfaccia: quando inserisci una ricetta puoi solo sceglierli
dall'elenco, mai crearne di nuovi. Per aggiungerne uno apri `server.py`, cerca il blocco
`TAG_GROUPS` (in cima al file, ben segnalato) e aggiungi una riga:

```python
("id-univoco", "Etichetta visibile"),
```

L'`id` non va più cambiato una volta usato — è quello salvato dentro le ricette.
L'etichetta invece si può riscrivere quando vuoi. Riavvia il server e il tag compare
sia nei filtri sia nel form. Per un gruppo nuovo, copia un blocco e cambia `id`, `label`, `color`, `icon`.

## File

```
server.py                   server + elenco dei tag
pubblica.command            manda online le ricette nuove
avvia.command               apre l'archivio sul Mac
docs/                       il sito — è la cartella che GitHub Pages pubblica
  index.html style.css app.js
  data/recipes.json         le ricette      ← il file da salvare se fai un backup
  data/config.json          i tag, riscritto a ogni avvio del server
  images/                   le foto
```

Il server scrive già dentro `docs/`, dove il sito legge: pubblicare è solo un `git push`,
non c'è niente da copiare a mano.

## Da sapere

Il repository è pubblico, quindi **ricette e foto sono visibili a chiunque abbia il link**.
È la condizione per poterle sfogliare dal telefono senza login. Se un giorno preferisci il contrario,
si passa a repository privato e si rinuncia al link (resta l'accesso in Wi-Fi di casa).

## Prossimo passo

Il calendario settimanale non c'è ancora, ma il posto è già segnato in fondo alla pagina:
le ricette hanno id stabili, quindi un piano dei pasti potrà agganciarsi senza toccare l'archivio.
