# 🍳 Archivio Ricette

Archivio delle ricette di casa. **Un solo link, da qualsiasi dispositivo**: apri, aggiungi,
modifica. Le ricette vivono dentro questo repository, quindi quello che scrivi dal telefono
lo ritrovi sul PC e viceversa.

👉 <https://giampynormo.github.io/archivio-ricette/>

## La prima volta: collegare la chiave

Perché la pagina possa scrivere nell'archivio le serve il permesso, che si dà una volta sola
per ogni dispositivo. Apri il link, tocca **Attiva la scrittura** (o l'icona 🔑 in alto) e segui
i sei passaggi che ti mostra. In sintesi, su GitHub:

1. Apri <https://github.com/settings/personal-access-tokens/new>
2. **Token name**: `Archivio Ricette`
3. **Expiration**: una scadenza lunga, o nessuna
4. **Repository access** → *Only select repositories* → `archivio-ricette`
5. **Permissions** → *Repository permissions* → **Contents** → *Read and write*
6. **Generate token**, copia, incolla nella pagina

La chiave resta nel browser dove l'hai incollata: non finisce nel repository e non serve
mandarla a nessuno. Per revocarla, si cancella dalla stessa pagina di GitHub; per toglierla
solo da un dispositivo, **Scollega** nella stessa finestra.

Senza chiave la pagina funziona lo stesso, ma in sola lettura: utile se apri il link su un
computer che non è tuo.

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

**Foto**: trascina un file sul riquadro, cliccalo per sceglierlo, oppure incolla con `⌘V`.
Vengono rimpicciolite nel browser prima di partire, così l'archivio resta leggero.

**Ingredienti e procedimento**: `Invio` crea la riga successiva, `Backspace` su una riga vuota
la cancella. Con **Incolla lista** butti dentro un elenco copiato da un sito e viene diviso
riga per riga.

Ogni salvataggio è un commit nel repository: hai la cronologia completa di ogni ricetta,
e niente si perde davvero.

## Aggiungere tag

Per ora c'è un tag solo, **Proteico**: la lista vera arriva quando l'hai decisa.

I tag stanno nel server, non nell'interfaccia: quando inserisci una ricetta puoi solo sceglierli
dall'elenco, mai crearne di nuovi. Per aggiungerne uno apri `server.py`, cerca il blocco
`TAG_GROUPS` (in cima al file, ben segnalato) e aggiungi una riga:

```python
("id-univoco", "Etichetta visibile"),
```

L'`id` non va più cambiato una volta usato — è quello salvato dentro le ricette. L'etichetta
invece si può riscrivere quando vuoi. Poi lancia il server una volta (riscrive
`docs/data/config.json`) e `pubblica.command`: il tag compare ovunque.

## L'archivio anche senza internet (facoltativo)

`avvia.command` fa partire un server sul Mac e apre <http://localhost:8790>: stessa app,
ma i dati restano in locale. Serve solo se sei offline. Con `pubblica.command` mandi online
quello che hai scritto così.

> Se in quel browser hai già collegato la chiave, anche `localhost` scrive su GitHub: un solo
> archivio, nessuna copia che diverge. Il server locale scrive per conto suo solo in un browser
> senza chiave.

## File

```
docs/                       il sito — è la cartella che GitHub Pages pubblica
  index.html style.css
  store.js                  dove vivono le ricette (GitHub, server locale o sola lettura)
  app.js                    l'interfaccia
  data/recipes.json         le ricette
  data/config.json          i tag
  images/                   le foto
server.py                   server locale + elenco dei tag
avvia.command               apre l'archivio sul Mac
pubblica.command            manda online quello scritto in locale
```

## Da sapere

Il repository è pubblico: **ricette e foto sono visibili a chiunque abbia il link**. È la
condizione per aprirlo da qualsiasi dispositivo senza login.

## Prossimo passo

Il calendario settimanale non c'è ancora, ma il posto è già segnato in fondo alla pagina:
le ricette hanno id stabili, quindi un piano dei pasti potrà agganciarsi senza toccare l'archivio.
