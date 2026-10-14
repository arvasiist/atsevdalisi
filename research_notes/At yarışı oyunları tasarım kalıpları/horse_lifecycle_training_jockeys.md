# Horse-level systems in horse racing management/simulation games: ownership, lifecycle, stats, training, care/fatigue, jockeys

> **Method note (read first).** Research date: 14.10.2026. In this sandbox, direct page fetches failed for every game domain I tried (WebFetch `ENOTFOUND`; curl through the proxy `CONNECT 403`): rivalstarshorseracing.com, umamusu.wiki, thirdtimegames.com, help.zedchampions.com, game8.co, pcgamesn.com, gematsu.com, the Starters Orders manual PDFs and fandom.com. **Every finding below comes from search-engine extracts of the linked pages, not from reading the pages in full.** The links point to the pages the extracts came from. Where an extract did not say which of several result pages a fact came from, I say so. Numbers should be spot-checked against the primary page before anyone puts them in a design doc. Confidence by source type: **[OFFICIAL]** = developer site, help center, manual or brochure; **[WIKI/GUIDE]** = community wiki or guide site; **[COMMUNITY]** = Steam/forum post or individual review; **[LOW]** = aggregator or generated wiki.

---

## 1. Horse lifecycle: age, career arc, retirement, stud/broodmare transition, horse count limits, acquisition

### Takeaway
The games that model a lifecycle all use the same one-way rule: **a racing career ends at retirement, and only a retired horse can breed.** Photo Finish Live, ZED Champions, Derby Owners Club and Rival Stars all do this, in different forms. Time is handled in one of three ways:
- **Real-time seasons:** Photo Finish ages a horse 1 year per 4-week real-time season.
- **A race-count career:** Derby Owners Club allows retirement after 20 races and expects decline at 30–45 races.
- **No ageing:** Rival Stars and ZED Champions use stat or level caps, plus breeding-slot caps, instead of age.

Lifetime breeding caps, such as ZED Champions' 10 breeding actions, are the main brake on inflation in ownership economies.

### Cited Findings
**Photo Finish Live (Third Time Games; web3/mobile; current live game)** [OFFICIAL, from extracts]
- A horse must be **retired before it can breed**, and can retire as early as **age 3**. Once retired it can no longer race. Horses may breed **until age 25** — [Third Time Games, "The Beginner's Guide to Breeding"](https://thirdtimegames.com/?p=5662)
- **Seasons last four real-life weeks**, and each horse **ages one year per season** — [Third Time Games, Beginner's Guide to Breeding](https://thirdtimegames.com/?p=5662)
- Each season has a fixed **breeding window, Day 2–10 of the season** ("as of this writing") — [Third Time Games, Beginner's Guide to Breeding](https://thirdtimegames.com/?p=5662)
- The game's age guide lists a **"mandatory retirement window from age 9 to 25"** and says **a horse dies at age 25**. The extract did not make clear whether "9–25" means retirement is forced from age 9 or simply possible across that range. This came from a sibling official help page, either [?p=684](https://thirdtimegames.com/?p=684) or [?p=686](https://thirdtimegames.com/?p=686); the extract did not say which.
- Breeding is the long-term strategy. Each **Generation Zero horse has a baseline performance denoted by its grade**, and **later generations can come out stronger or weaker** — [Photo Finish Live official site](https://thirdtimegames.com/photo-finish-live/)

**ZED Champions (2024+ relaunch of ZED RUN)** [OFFICIAL help center, from extracts]
- A horse starts with a default number of breeding slots that depends on its generation: **slots = 5 − generation, minimum 0**. Extra slots cost **Forge Tokens**. A horse is capped at **10 breeding actions over its lifetime** — [ZED Champions Help: Breeding](https://help.zedchampions.com/articles/517615-breeding)
- To breed, a horse **must be racing-retired** and have at least one free breeding slot — [ZED Champions Help: Breeding](https://help.zedchampions.com/articles/517615-breeding)
- Every racing horse enters ZED Champions with **1,000 matchmaking points**, which decide where it races and which prize pools it competes for — [VHS Lab, "ZED Champions: Your First 48 Hours"](https://vhslab.com/news/first-48-hours)
- *Older ZED RUN (2021-era, likely obsolete):* the base breeding fee was a minimum of **0.075 ETH** and depended on bloodline, breed type and how long the sire had been at stud. Breeding inside your own stable got a **35% discount**. A foal's genotype was the **sum of the two parents' Z numbers** — [publish0x, ZED.RUN Part III: Breeding](https://www.publish0x.com/mckay-stevenson/zedrun-the-next-evolution-in-online-gaming-part-iii-breeding-xellmgx) [WIKI/GUIDE, older]

**Derby Owners Club (Sega arcade, 1999 onward)** [OFFICIAL brochure + WIKI]
- After **20 races** the player may retire the horse to the breeding stable as a sire or dam. Doing so means it can **never race again** — [Wikipedia: Derby Owners Club](https://en.wikipedia.org/wiki/Derby_Owners_Club)
- The official brochure says a horse **"will no longer be competitive... usually between 30–45 races, depending on how good your horse is"** — [Sega, DOC World Edition brochure (PDF)](https://segaretro.org/images/3/32/Derby_Owners_Club_World_Edition_Brochure.pdf). Another guide gives a typical career of about **20–40 races** — [Bragging Rights Amusements guide](https://braggingrights.com/derby-owners-club-the-rarest-arcade-game-in-america-is-in-gainesville-fl-and-heres-how-to-play-it/)
- Progress is saved to a **physical card** that can be scanned at any cabinet — [Wikipedia: Derby Owners Club](https://en.wikipedia.org/wiki/Derby_Owners_Club)

**Rival Stars Horse Racing (Foxglove Studios; mobile + "Desktop Edition" on Steam)**
- A horse's **Grade determines the highest level it can be trained to**, how many Diet Plans it can equip, and which Live Races it can enter — [Rival Stars official Breeding Guide](https://www.rivalstarshorseracing.com/breeding-guide) [OFFICIAL]
- A foal's grade usually **matches, or is one above, its lowest-grade parent**. A foal born above its parents' grade gets stats **lower than the parents' average**, so the guide advises matching the lowest parent's grade. Access to higher grades depends on **Prestige level and foaling-stall upgrades** — [Rival Stars official Breeding Guide](https://www.rivalstarshorseracing.com/breeding-guide)
- **Foal Care unlocks at Prestige 6.** Regular care and feeding give a foal **extra bonus stats**. Each caretaker has a skill level and guarantees a different bonus amount. Players feed until the bonus bar is full, then move the foal to mare or stallion status — [Rival Stars Player Guide wiki: Breeding](https://rival-star-horse-racing-player-guide.fandom.com/wiki/Breeding) [WIKI]
- A player found the foal-stall upgrade text confusing ("breed level 3" seemed to mean stat level, not grade) — [Steam discussion: Foal Stall Levels Confusing](https://steamcommunity.com/app/1166860/discussions/0/4407417406449711068/) [COMMUNITY]
- Players complain about a **small selection of horses for sale at any time** (a mobile complaint) — [Steam reviews, top rated](https://steamcommunity.com/app/1166860/reviews?browsefilter=toprated) [COMMUNITY]

**Umamusume: Pretty Derby (Cygames)**: a bounded career, not a persistent horse
- A career runs **three in-game years: Junior, Classic, Senior** — [Deltia's Gaming, Summer Camp Guide](https://deltiasgaming.com/umamusume-pretty-derby-summer-camp-guide/) [WIKI/GUIDE]
- One guide puts the whole career at **74 turns**. This is a single, unconfirmed source — [uma.guide, Career Mechanics](https://uma.guide/guides/career-mechanics) / [uma.guide, URA Career Basics](https://uma.guide/guides/beginners-ura); the extract did not say which of the two.
- The global version launched **26 June 2025** — [Wikipedia: Umamusume: Pretty Derby](https://en.wikipedia.org/wiki/Umamusume:_Pretty_Derby)

**Derby Stallion (ASCII/Enterbrain, Japan)** [LOW]
- The goal is to win GI races by building the best possible stock of horses — [Wikipedia: Derby Stallion](https://en.wikipedia.org/wiki/Derby_Stallion). One generated wiki says **breeding is restricted to April** — [Grokipedia: Derby Stallion](https://grokipedia.com/page/Derby_Stallion) [LOW, unverified]

**Winning Post (Koei Tecmo)**
- The player is an **owner-breeder**. The series turned 30 in 2023 — [RAWG: Winning Post 10](https://rawg.io/games/winning-post-10)

### Inferences
- **"Retire to breed" is the strongest common pattern.** It turns an aging racer into an asset with a second phase, so the horse keeps value. It also stops one horse from both racing and producing foals at the same time.
- **Real-time ageing (Photo Finish: 1 year per 4 weeks, dead at 25 ≈ 2 real years) gives a hard upper bound on any one horse's lifetime** and forces turnover. This suits a persistent online economy, and it suits a server-authoritative game like At Sevdalısı. A race-count career (Derby Owners Club) is easier to explain but rewards grinding races.
- **Lifetime breeding caps (ZED Champions: 10 actions; slots = 5 − generation) are the anti-inflation control** in player-owned horse economies. Without one, a single elite stallion floods the market.
- Rival Stars' "foal grade ≤ lowest parent + 1" rule is a **ceiling that stops grade climbing by breeding alone**. Players have to unlock grades through Prestige or facility upgrades, which ties breeding progress to account progression.

### Gaps
- **Rival Stars:** no source found on horse ageing or forced retirement. The extracts suggest there is no age system, but this is not confirmed. No stable/horse count limit was found.
- **Photo Finish Live:** the meaning of "mandatory retirement window 9–25" is unclear. No horse-count limit or starter-horse acquisition rule was found (it is a web3 game; acquisition seems to be by purchase or breeding).
- **Winning Post and Derby Stallion:** no reliable source on growth curves, peak age, retirement age or broodmare transition. The [Grokipedia](https://grokipedia.com/page/Derby_Stallion) page is generated and low-trust. Japanese-language wikis would be the next step.
- **Starters Orders and Horse Racing Manager:** no lifecycle numbers found.
- **First-horse acquisition rules** (free starter vs purchase) were not found for any game except by implication.

---

## 2. Stats model: which stats exist, visible vs hidden stats, potential and ceilings

### Takeaway
Two designs dominate:
- **(a) Few, fully visible stats with a hard ceiling per horse.** Rival Stars uses 5 stats, a fixed base-stat grade from A+ to D, and a grade-based level cap. Umamusume uses visible stats, a 1200 cap, and aptitude letters from G to S.
- **(b) A hidden "true ability" that the player infers from results.** Photo Finish hides its 6 attributes until the horse retires. ZED Champions has public plus "secret" attributes.

Surface and distance **aptitude**, shown as letter grades, matters as much as raw stats in every game where it exists.

### Cited Findings
**Rival Stars** [OFFICIAL]
- Five stats: **Speed, Sprint Energy, Acceleration, Agility, Jump.** Story races mostly depend on Speed, Sprint Energy and Acceleration. Cross Country depends on Speed, Agility and Jump — [Rival Stars Breeding Guide](https://www.rivalstarshorseracing.com/breeding-guide)
- **Base Stats are graded A+ down to D and never change.** Higher base stats mean a stronger horse once fully trained. A foal's base stats tend toward the **average of its parents'** — [Rival Stars Breeding Guide](https://www.rivalstarshorseracing.com/breeding-guide)
- **Grade runs 1–10** and sets the maximum trainable level in all stats. Within a grade there is a **"stat level" from 1 to 50** — [Rival Stars fandom: Maximum Stats](https://rivalstars-horseracing.fandom.com/wiki/Maximum_Stats) [WIKI] and a [Steam discussion](https://steamcommunity.com/app/1166860/discussions/0/2800629075201821347) [COMMUNITY]. Note that the official guide still speaks of training "all three stats", so the grade cap text may predate the Agility/Jump stats.
- **Traits** can improve performance, save energy, or give breeding advantages — [Rival Stars, A Visual Guide to Traits](https://www.rivalstarshorseracing.com/traits-guide) [OFFICIAL]
- **Surface preference:** one player calls matching it "the most important part to winning any race" — [Steam discussion](https://steamcommunity.com/app/1166860/discussions/0/4033600083803961848) [COMMUNITY]
- **Horse types and jumping stats** were added in a 2021 update, together with Quick Ride — [The Mane Quest, March 2021](https://themanequest.com/blog/2021/3/5/new-features-in-rival-stars-quick-ride-horse-types-jumping-stats) [WIKI/GUIDE, older]

**Photo Finish Live** [OFFICIAL, from extracts]
- Six attributes: **Start, Speed, Stamina, Finish, Heart, Temper.** **Attributes stay hidden until the horse retires.** Stamina is "the horse's ability to keep running as it tires; the longer the race, the more important it is" — Third Time Games horse FAQ, either [?p=685](https://thirdtimegames.com/?p=685) or [?p=684](https://thirdtimegames.com/?p=684) (the extract did not say which)
- The design frames a deliberate trade-off: gamble on **"a raw speed demon that has subpar temper"**, or pick a **consistent lower-grade horse** that wins lower-stakes races — [Photo Finish Live official site](https://thirdtimegames.com/photo-finish-live/)
- Race conditions vary by **prize pool, weather, track condition and distance** — [Photo Finish Live official site](https://thirdtimegames.com/photo-finish-live/)

**ZED Champions / ZED RUN**
- Each horse has **"a number of public and secret attributes"** that affect racing, and a foal's performance is **"strongly based on its lineage"** — [ZED Champions Help: Horse Attribute & Performance](https://help.zedchampions.com/articles/174568-horse-attribute) [OFFICIAL]
- *Older ZED RUN:* bloodline was said to make up **80% of the overall ability weighting**, with bloodline weights Nakamoto 180%, Szabo 120%, Finney 40%, Buterin 15% — this came from a fan guide; the extract did not identify which result page (candidates: [Sensorium, How to play ZED RUN](https://sensoriumxr.com/articles/how-to-play-zed-run), [publish0x Part III](https://www.publish0x.com/mckay-stevenson/zedrun-the-next-evolution-in-online-gaming-part-iii-breeding-xellmgx)) [WIKI/GUIDE, older, attribution uncertain]
- *Older ZED RUN:* horses were sorted into a **class system, Class 1–5 plus an unraced "Griffin" tier** — [Medium, ZED RUN for Dummies](https://medium.com/sidechain/zed-run-for-dummies-d99007c87cdd) / [Medium, ZED.RUN Part II: racing](https://mckay800.medium.com/zed-run-the-next-evolution-in-gaming-part-ii-racing-99830ec36203) [WIKI/GUIDE, older]

**Umamusume** [WIKI/GUIDE]
- **Aptitudes run from G (lowest) to S.** Below A they reduce performance; **S raises performance by 5–10%.** Aptitudes cover surface, distance and running style — [GuruGamer, How stats work](https://gurugamer.com/mobile-games/how-stats-work-inumamusume-pretty-derby-25155/amp) / [PCGamesN, stats](https://www.pcgamesn.com/umamusume-pretty-derby/stats)
- Aptitudes can be raised **one level by an "Aptitude Spark"** during inspiration events in early April of the Classic and Senior years. A pink spark takes A to S — [Deltia's Gaming, How to get S-rank aptitude](https://deltiasgaming.com/?p=309651)
- The **base stat cap is 1200.** Sources conflict on breaking it. One says an S aptitude allows going past 1200; a GameWith article says the **global version has no cap-break system** in training scenarios; a low-quality source claims about 2000 (unverified) — [GameWith](https://gamewith.net/uma-musume/69552); [GameWith](https://gamewith.net/uma-musume/69568)

**Derby Owners Club** [WIKI]
- Horses come in **two types, front runners and stretch runners**, with different strengths. **Whip timing must match the type** — [Wikipedia: Derby Owners Club](https://en.wikipedia.org/wiki/Derby_Owners_Club); [TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/DerbyOwnersClub)

**Derby Stallion** [LOW]
- Horses are judged by **trait grades from A (excellent) to E (poor)** for distance aptitude, dirt suitability, **growth rate**, temperament, **reserve strength**, **health** and **stability** — [Grokipedia: Derby Stallion](https://grokipedia.com/page/Derby_Stallion) (generated wiki; unverified)

**Winning Post 10** [OFFICIAL-ish store and press text]
- **"Uma-sonality":** each horse has a personality it is born with and a personality that is **discovered as it grows**. It shifts with race experience and events, and the player's trial-and-error decisions "greatly affect" success — [Gematsu, Winning Post 10 first details](https://www.gematsu.com/2022/12/winning-post-10-first-details-screenshots); [RAWG](https://rawg.io/games/winning-post-10)

**Horse Racing Manager (Sheep Meadow Road Games, Steam, released 24 October 2025)**
- Its stats are **stamina, speed and injury resistance**, inherited and refined through selective breeding — [Raijin: Horse Racing Manager](https://raijin.gg/app/2740170/Horse_Racing_Manager) / [The Mane Quest announcement](https://www.themanequest.com/blog/2024/3/31/game-announcement-horse-racing-manager-a-2d-horse-racing-simulation-game)

**Starters Orders** [OFFICIAL manuals]
- Horses carry **handicap ratings**. The horse table shows **LWR/R (Last Winning Rating / current Rating)**, and players are told to enter races that suit the horse's rating — [Starters Orders 7 Instructions (PDF)](https://www.startersorders.com/docs/so7instructions.pdf)

### Inferences
- **Fixed potential plus a trainable level** (Rival Stars: immutable A+–D base grade times a level cap) is the clearest "ceiling" design. Players always know whether a horse is worth investing in, and breeding becomes the only way to raise the ceiling. At Sevdalısı's breeds already work like this: breed gives birth stats with jitter.
- **Hidden attributes** (Photo Finish hides everything until retirement; ZED keeps secret attributes) push players to learn a horse by racing it. They also feed speculation in a player market. The cost is player frustration and opacity. Photo Finish softens this by revealing everything at retirement, which is exactly when breeding value matters.
- **Letter-grade aptitudes** (Umamusume G–S, Derby Stallion A–E, Rival Stars A+–D) are the readable way to show fit for surface, distance and running style. At Sevdalısı's hidden personality traits, which are shown only as a derived label, are close to Winning Post's "uma-sonality" and Photo Finish's Temper.
- **Temperament/Temper as a variance stat** (high speed but unreliable) is a proven way to make a "worse" horse a sensible pick. It creates risk-versus-consistency choices without adding new systems.

### Gaps
- Umamusume's five base stats (in my background knowledge: Speed, Stamina, Power, Guts, Wit/Wisdom) were **not confirmed** by any extract in this session. The PCGamesN and GameWith pages that would confirm them could not be fetched.
- **Photo Finish Live:** no detail on how the grade (Gen 0 baseline) maps to attributes, or how distance and surface preference work. One community page on distance exists ([Bukidnon Farms PFL: Distance](https://bukidnon-farms-pfl.notion.site/Distance-in-PFL-17ff0c93488a80b392eaf735c35d0571)) but was not readable.
- **Winning Post / Derby Stallion:** no verified growth-type (early or late bloomer) mechanic was found in English sources, although the series is known for it.

---

## 3. Training, energy/fatigue/condition/form, recovery timers, injury and vet care, overtraining

### Takeaway
Every successful design gates training or racing with **a recoverable resource plus a failure or penalty risk that grows as the resource runs out**:
- **Umamusume:** an energy bar, a failure chance that "jumps" when energy is at or below 30, and a rest action worth +50 energy that costs one turn.
- **Photo Finish:** a post-race "Exhausted" status for 20 h, then "Recovering" for 4 h.
- **Starters Orders:** a fitness percentage that must reach about 70–80% before harder work.
- **Rival Stars mobile:** real-time training timers of about 5 min to 4 h.

Umamusume adds a **mood multiplier (±10%/±20%)** and **negative conditions cured by rest or the infirmary**. These are the closest analogues to injury and illness.

### Cited Findings
**Umamusume** [WIKI/GUIDE]
- **Failure chance** is shown before you pick a training. Low energy is the main driver, and one guide says the failure rate **"jumps drastically at 30% or lower" energy** — [umamusu.wiki: Conditions](https://umamusu.wiki/Game:Conditions); [Deltia's Gaming, Conditions Guide](https://deltiasgaming.com/?p=279958)
- **Rest uses one turn and recovers 50 energy.** Rest outcomes can vary — [Deltia's Gaming, How does mood work](https://deltiasgaming.com/?p=277945) / [DTGRE, Training events & mood guide](https://www.dtgre.com/2025/07/umamusume-training-events-mood-guide.html?m=0)
- **Mood has five levels.** Great and Good raise training results by **+20% and +10%**; Bad and Awful lower them by **−10% and −20%**. **A failed training from low energy can also lower mood** — [Deltia's Gaming, How does mood work](https://deltiasgaming.com/?p=277945)
- Example conditions and their size: **Practice Perfect ○ lowers stat-training failure by 2%; Practice Poor raises it by 2%.** **Migraine stops mood from improving.** **Night Owl drains energy over time.** Most negative conditions are cured by **one Rest or one Infirmary visit**; some need several — [umamusu.wiki: Conditions](https://umamusu.wiki/Game:Conditions); [GuruGamer, How to remove negative conditions](https://gurugamer.com/mobile-games/umamusume-pretty-derby-how-to-remove-negative-conditions-25221/amp)
- **An Infirmary visit costs a turn.** Outside Summer Camp, cures carry a **chance of failure** — [uma.guide, Career Mechanics](https://uma.guide/guides/career-mechanics)
- **Summer Camp** runs **4 turns in each of the Classic and Senior years** (early July to early September). During camp, "Rest & Recreation" gives **+40 energy, +1 mood and heals all negative conditions** (but not career-specific ones). Guides advise resting before camp — [Deltia's Gaming, Summer Camp Guide](https://deltiasgaming.com/umamusume-pretty-derby-summer-camp-guide/)

**Photo Finish Live** [OFFICIAL, from extracts]
- After a race a horse is **"Exhausted" for 20 hours and cannot race**, then **"Recovering" for another 4 hours** — Third Time Games help page, either [?p=685](https://thirdtimegames.com/?p=685) or [?p=686](https://thirdtimegames.com/?p=686) (the extract did not say which)

**Rival Stars**
- **Mobile:** training takes a set real time, **from about 5 minutes up to 4 hours**. One reviewer says the timers "help them step away from the game" — [Steam reviews (top rated)](https://steamcommunity.com/app/1166860/reviews?browsefilter=toprated) [COMMUNITY]
- **Desktop Edition:** reviewers report **"no energy restriction, very short wait times, training is instant"** and **"no energy cap, breeding/training timers are super low"** — [Steam reviews (top rated)](https://steamcommunity.com/app/1166860/reviews?browsefilter=toprated) [COMMUNITY]
- The training menu unlocks at **level 10 of the Prestige road map** — [Steam discussion: training](https://steamcommunity.com/app/1166860/discussions/0/5688649843788831651/) [COMMUNITY]
- In races, **Sprint Energy** is the in-race resource: once the sprint bar is nearly full you can sprint more often, and good Acceleration plus Sprint Energy lets a horse start sprinting earlier — [Steam discussion](https://steamcommunity.com/app/1166860/discussions/0/4033600083803961848) [COMMUNITY]

**Starters Orders 6/7** [OFFICIAL manuals; older editions]
- When fitness starts to **peak under "Lot2" (roughly 70%–80%)**, the horse is ready for more vigorous exercise. In other words, training intensity is staged by a fitness percentage — [SO7 Instructions (PDF)](https://www.startersorders.com/docs/so7instructions.pdf); [SO6 Instructions (PDF)](http://www.startersorders.com/assets/SO6Instructions.pdf)

**Derby Owners Club** [WIKI]
- Training means choosing from **ten mini-game regimes**, and each one develops specific racing abilities — [Wikipedia: Derby Owners Club](https://en.wikipedia.org/wiki/Derby_Owners_Club)

**ZED RUN (older)** [WIKI/GUIDE, older]
- **Stamina dropped below 90% after several races** and took **12 hours** to recover fully — [Medium, ZED RUN for Dummies](https://medium.com/sidechain/zed-run-for-dummies-d99007c87cdd) (no confirmation that this carried over to ZED Champions)

**Horse Racing Manager (2025)**
- **Injury resistance** is a core, heritable stat, and players make choices about how to train, feed and breed — [Raijin: Horse Racing Manager](https://raijin.gg/app/2740170/Horse_Racing_Manager)

### Inferences
- **A failure probability that is shown up front and rises sharply below an energy threshold** (Umamusume, ≤30) is the clearest anti-overtraining design. The player sees the risk before committing, and resting becomes a real strategic choice rather than a chore. At Sevdalısı already has a training injury chance and fatigue. Showing the injury percentage before confirming, and adding a steep curve at low energy, would follow this proven pattern.
- **The mood/condition multiplier** (±10/±20% on gains) gives care actions a mechanical payoff without touching race results directly. It is a safe lever in a server-authoritative design.
- **Fixed post-race lockouts** (Photo Finish: 20 h + 4 h) are the simplest anti-farming control for real-money or competitive economies. They cap races per horse per day, which pushes owners toward owning several horses. Note that the Rival Stars desktop edition **removed** timers, and reviewers praised that, so timers are disliked when they only exist to sell skips.
- A **two-stage recovery** ("cannot race" followed by "can race but not at full strength") gives more texture than a single cooldown.

### Gaps
- **Rival Stars:** no source gave exact energy costs, stat gains per session or diminishing-returns formulas.
- **Photo Finish Live:** no information found on training or workouts at all. It may have no training (the horse is a fixed genetic asset), but this is unconfirmed.
- **Injury and vet systems:** no verified injury-duration or vet-cost numbers were found for any game. Umamusume's conditions and infirmary are the closest analogue. Starters Orders and Winning Post very likely model injuries, but no extract confirmed details.
- **Diminishing returns:** no game's formula was found. Umamusume's stat cap of 1200 and Rival Stars' level cap are hard caps rather than curves.

---

## 4. Care, feeding and equipment: do they matter mechanically, and how do games stop them becoming chores?

### Takeaway
Care matters mechanically in the games players remember fondly, but only when it is **tied to a visible payoff and a small number of decisions per session**:
- **Derby Owners Club:** one food choice after training, matched to the horse's personality and condition, moves a trust meter that affects race behaviour.
- **Rival Stars:** foal care fills a bonus-stat bar, and caretaker skill sets the bonus.
- **Horse Racing Manager:** feeding is one of three listed decision areas.

Where care has no effect, reviewers say so. One horse game database notes that Rival Stars' stable has "no interactions with the horses and no care work".

### Cited Findings
- **Derby Owners Club:** after training the player picks a food. The right food for the horse's **personality and current condition** raises the **trust "heart" meter**; the wrong food does nothing at best and damages trust at worst. A good relationship "will show in their behaviour" in races — [Wikipedia: Derby Owners Club](https://en.wikipedia.org/wiki/Derby_Owners_Club); [Bragging Rights Amusements guide](https://braggingrights.com/derby-owners-club-the-rarest-arcade-game-in-america-is-in-gainesville-fl-and-heres-how-to-play-it/); [TMQ Horse Game Database: DOC](https://horsegamedatabase.miraheze.org/wiki/Derby_Owners_Club) [WIKI]
- **Rival Stars:** **Diet Plans** are equipment-like slots, and the **number of Diet Plans a horse can equip is set by its Grade** — [Rival Stars Breeding Guide](https://www.rivalstarshorseracing.com/breeding-guide) [OFFICIAL]
- **Rival Stars:** foal care and feeding fill a **bonus-stat bar**, and the bonus depends on **caretaker skill level** (unlocks at Prestige 6) — [Rival Stars Player Guide wiki: Breeding](https://rival-star-horse-racing-player-guide.fandom.com/wiki/Breeding) [WIKI]
- **Rival Stars:** a player complained "I fed my foal like 12 times and he doesn't grow", which suggests the feedback on care progress is unclear — [Steam discussion](https://steamcommunity.com/app/1166860/discussions/0/3056237966700330607/) [COMMUNITY]
- **Rival Stars:** the TMQ database says the stable has **"no interactions with the horses and no care work to be done"**. This conflicts with the foal-care system above and probably refers to adult horses only — [TMQ Horse Game Database: Rival Stars](https://horsegamedatabase.miraheze.org/wiki/Rival_Stars_Horse_Racing) [WIKI]
- **Horse Racing Manager (2025):** the Steam description stresses decisions about how to **train, feed and breed**. Previews call it "more about strategies and spreadsheets" — [Raijin](https://raijin.gg/app/2740170/Horse_Racing_Manager); [The Mane Quest announcement](https://www.themanequest.com/blog/2024/3/31/game-announcement-horse-racing-manager-a-2d-horse-racing-simulation-game)
- **Umamusume:** "care" is folded into the turn economy. Rest, Recreation (which raises mood) and the Infirmary each **cost a turn that could have gone to training**, so care is a trade-off rather than a chore — [Deltia's Gaming, How does mood work](https://deltiasgaming.com/?p=277945); [uma.guide, Career Mechanics](https://uma.guide/guides/career-mechanics)

### Inferences
- **The anti-chore pattern is "one meaningful choice per cycle, with an opportunity cost".** DOC asks for one food pick after each training. Umamusume makes rest cost a turn. Neither asks for repeated clicking.
- **Care should feed a meter that has a clear mechanical consequence**: trust in DOC, a bonus-stat bar in Rival Stars, mood in Umamusume. A care action with no visible result produces the "fed him 12 times, nothing happened" complaint.
- **Equipment as grade-limited slots** (Rival Stars Diet Plans) ties gear to horse quality and stops a cheap horse being "fixed" with gear. At Sevdalısı's catalogue equipment with level gates is in line with this.
- Using personality as a *requirement* for the right care choice (DOC: food matched to personality) is a cheap way to make hidden traits playable. It fits At Sevdalısı's hidden five-trait personality model.

### Gaps
- No sources found on grooming or bond mechanics in Rival Stars beyond foal care.
- No sources on equipment (saddles, shoes, blinkers) for Photo Finish, Winning Post or Starters Orders. Whether equipment matters mechanically in those games is unconfirmed.
- No sources found on feeding cost or economy numbers.

---

## 5. Jockeys: hiring and contracts, stats and race effects (tactics, whip, positioning), compatibility, AI vs player tactics

### Takeaway
Three jockey models appear:
- **(a) The player is the jockey.** Derby Owners Club uses whip and hold buttons, and over-whipping costs the horse's confidence. Rival Stars has the player ride.
- **(b) The jockey is a hired NPC with stats and orders.** Starters Orders jockeys have fitness, strength and a 5-star form rating; booking is optional, staff assign one by default, and orders like "Go Easy" can draw a stewards' fine. Winning Post has players hire professional jockeys.
- **(c) There is no jockey at all.** Photo Finish Live and ZED treat the horse as the only performance asset. Umamusume folds "jockeying" into running-style aptitude.

The DOC whip/confidence trade-off and the Starters Orders jockey fitness/strength that shows up "in the finish" are the clearest concrete mechanics.

### Cited Findings
**Derby Owners Club** [WIKI]
- During the race the player controls speed with **whip and hold buttons**. **"Whipping the horse too much will make it lose confidence in the player."** Whip timing that matches the horse type (front or stretch runner) is critical — [Wikipedia: Derby Owners Club](https://en.wikipedia.org/wiki/Derby_Owners_Club); [TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/DerbyOwnersClub)
- The player takes the combined roles of **breeder, trainer, jockey and owner** — [Wikipedia: Derby Owners Club](https://en.wikipedia.org/wiki/Derby_Owners_Club)

**Starters Orders (6/7/8 Touch)** [OFFICIAL manuals; mainly older editions]
- Jockeys have **Fitness (which may fluctuate due to profile parameters) and Strength**. **Both may affect riding, usually in the finish.** A tired jockey's icon flashes during the race — [Starters Orders 8 Touch Instructions (PDF)](https://www.startersorders.com/sotInstructions.pdf); [SO7 Instructions (PDF)](https://www.startersorders.com/docs/so7instructions.pdf)
- **Stars (max 5)** show a jockey's or trainer's **current performance ranking**, in effect a form rating — [SO7 Instructions (PDF)](https://www.startersorders.com/docs/so7instructions.pdf)
- **Booking a jockey is optional.** If you don't book one, **your stable staff allocate one on the day** — [SO7 Instructions (PDF)](https://www.startersorders.com/docs/so7instructions.pdf)
- **Riding orders:** "Go Easy" tells the jockey to ride quietly at the back. The horse is unlikely to win, and **if the stewards spot it, the trainer is fined** — [SO6 Instructions (PDF)](http://www.startersorders.com/assets/SO6Instructions.pdf)
- SO7 lets you play as **jockey, punter, trainer and breeder** — [Steam: Starters Orders 7](https://store.steampowered.com/app/978960/Starters_Orders_7_Horse_Racing/). **Starters Orders Touch was released in January 2024** (iOS and desktop) — [Steam: Starters Orders Touch](https://store.steampowered.com/app/2765880/Starters_Orders_Touch_Horse_Racing/). SO8 had missed its Q1 window according to a 2026 worklog — [startersorders.com SO8](https://www.startersorders.com/so8.html)

**Winning Post (older entries)**
- The goal is to take a stable of horses, **hire professional jockeys to ride them**, and earn money from winning and betting — [Giant Bomb: Winning Post](https://giantbomb.com/wiki/Games/Winning_Post) [WIKI]

**Horse Racing Manager (2025)**
- Pre-release notes mention **staff hiring and negotiation, where every in-game person has a "salary acceptance threshold"** — [The Mane Quest announcement](https://www.themanequest.com/blog/2024/3/31/game-announcement-horse-racing-manager-a-2d-horse-racing-simulation-game). Whether this covers jockeys was not confirmed.

**Photo Finish Live**
- No extract mentioned jockeys. The owner's levers are horse choice, breeding and race entry (an entry fee, with winners paid out after the race) — [Photo Finish Live official site](https://thirdtimegames.com/photo-finish-live/); [App Store listing](https://apps.apple.com/us/app/photo-finish-live/id6504777327)

**Rival Stars**
- The player rides directly, using sprint energy and positioning. Players call the racing "unintuitive", and one said it took **3 hours of trial and error to beat a rival** — [Steam discussion: I don't get the hang of winning a race](https://steamcommunity.com/app/1166860/discussions/0/3056237966705491116/) [COMMUNITY]

**Umamusume**
- There is no jockey. Running style is an aptitude graded G–S (see section 2), and below A it reduces performance — [GuruGamer, How stats work](https://gurugamer.com/mobile-games/how-stats-work-inumamusume-pretty-derby-25155/amp)

### Inferences
- **DOC's "over-whipping costs confidence" is the canonical counterweight to an unlimited whip.** At Sevdalısı's player-controlled whip is unlimited by the owner's decision, but burns stamina and adds permanent fatigue. That is the same idea expressed as a resource cost rather than a relationship cost. A confidence/trust penalty is a possible second axis that would reuse the personality traits (obedience).
- **Starters Orders shows the minimal NPC-jockey model that still matters:** two stats (fitness, strength) that act mainly in the finish, a visible form rating (stars), optional booking with automatic assignment as the default, and riding orders. At Sevdalısı already has jockey form and fatigue derived from recent rides and frozen into the race snapshot, which is close to SO's fluctuating fitness and form stars.
- **Default auto-assignment** (SO stable staff pick a jockey) avoids the jockey system becoming mandatory busywork. This fits casual players.
- Penalising **deliberate non-trying** (SO stewards fine "Go Easy") is a guard against handicap manipulation. It is relevant if level-bracket or handicap races exist, since a player could otherwise sandbag a horse's rating.
- No game found uses explicit **jockey-horse compatibility** as a public system. At Sevdalısı's compatibility influence (0.15) appears to be ahead of the reference games, or at least not documented in them.

### Gaps
- No verified source on jockey contracts, salaries or retainer fees in any game. HRM's "salary acceptance threshold" is the closest match.
- No information on jockey weight, claims or allowances, apprentice systems, or jockey ageing.
- No verified jockey-horse compatibility mechanic in any reference game. Winning Post likely has one (horse personality versus jockey), but no English source confirmed it.
- Photo Finish Live: whether jockeys exist at all is unconfirmed.

---

## 6. What players praise vs complain about

### Takeaway
Players praise **depth of genetics and training**: Rival Stars' genetics, Umamusume's training depth (which Sensor Tower links to its core-gamer audience), and Starters Orders' simulation depth. They complain about:
- **Repetitive core loops:** race, train, breed in Rival Stars; the single career at Umamusume's launch.
- **Timers and monetised gates:** Rival Stars mobile versus a timer-free desktop edition that players prefer.
- **Pay-to-win competition:** Umamusume's PvP.
- **Opaque race mechanics:** Rival Stars racing called "unintuitive".
- **RNG swings:** Umamusume training outcomes.

### Cited Findings
**Rival Stars (Steam Desktop Edition)**
- An aggregator reports about **4,991 Steam reviews, 92% positive**. In its sample, the **top complaint was a content gap versus mobile and few updates (45 of 120 analysed reviews)** — [SteamStat: Rival Stars Desktop Edition](https://steamstat.io/app/1166860) [LOW, aggregator; unverified]
- Players find the game becomes monotonous, **"boiling down to a simple cycle of racing, training, and breeding"** — [Steam reviews (top rated)](https://steamcommunity.com/app/1166860/reviews?browsefilter=toprated) [COMMUNITY]
- Praise: **detailed horse models and animation, the in-depth genetics system, a relaxing feel**. Desktop players praise the **absence of energy caps and timers** — [Steam reviews (top rated)](https://steamcommunity.com/app/1166860/reviews?browsefilter=toprated); [Champs of the Track, gameplay & opinion](https://www.champsofthetrack.com/post/the-new-horse-racing-app-you-have-to-have) [COMMUNITY]
- A December 2025 reviewer changed from negative to positive after **jumping disciplines** arrived on desktop — [Steam reviews (top rated)](https://steamcommunity.com/app/1166860/reviews?browsefilter=toprated) [COMMUNITY]
- Racing is called **unintuitive** — [Steam discussion](https://steamcommunity.com/app/1166860/discussions/0/3056237966705491116/) [COMMUNITY]

**Umamusume: Pretty Derby (global, 2025–26)**
- Game8 scored it **84/100**. Its criticisms were **repetitive scenarios and events** and that **"PvP is still P2W"** — [Game8 review](https://game8.co/articles/reviews/uma-musume-pretty-derby-review)
- At launch Steam users complained there was **"only ONE career and basically ONE real PvP mode"**, so players repeated the same career. Others complained about **gacha odds**, stingy premium currency, and **training outcomes that "vary wildly even with optimal decision-making"** — [Steam: "Umamusume fails as a gacha game"](https://steamcommunity.com/app/3224770/discussions/0/597406481786285831/); [Steam: "Really dated Gacha"](https://steamcommunity.com/app/3224770/discussions/0/597406481786257288/); [Steam: "What's actually fun?"](https://steamcommunity.com/app/3224770/discussions/0/597405723931084074/) [COMMUNITY]
- Defenders call it a management sim rather than a typical gacha, "innovative and very well made" — [Steam discussions](https://steamcommunity.com/app/3224770/discussions/0/597406481786285831/) [COMMUNITY]
- **Close to 80% of Umamusume's Steam players had more than 100 games in their libraries.** Sensor Tower speculates that **"the depth of Umamusume's game mechanics and training system"** draws this core audience. Daily active users grew steadily, with jumps around banner releases — [Automaton](https://automaton-media.com/en/news/umamusume-pretty-derby-highly-popular-among-core-gamers-with-over-100-games-on-steam-research-says/)

**Starters Orders 7**
- Racing Ahead (2019) called it **"the undisputed Frankel of horse racing computer games"** — [PressReader, Racing Ahead review](https://www.pressreader.com/ireland/racing-ahead/20190317/281651076444234); GameGrin gave it **7/10** (cited on the Steam page) — [Steam: SO7](https://store.steampowered.com/app/978960/Starters_Orders_7_Horse_Racing/)
- One estimate (July 2026) gives **78% positive across 175 Steam reviews** and about 4.1K copies sold (medium confidence) — [Raijin: SO7](https://raijin.gg/app/978960/Starters_Orders_7_Horse_Racing) [LOW]
- Players value that it **"can be played simply or you can control all aspects of your yard"** (scalable depth). The mobile version's only in-app purchases are **optional game-fund boosts** — [TouchArcade: SO7](https://toucharcade.com/games/starters-orders-7-horse-racing); [Steam: SO7](https://store.steampowered.com/app/978960/Starters_Orders_7_Horse_Racing/)

**Horse Racing Manager (2025)**
- **"Very Positive", about 88% across roughly 179–194 reviews** (counts vary by source and date). Players describe it as a slow-burn, spreadsheet-style single-player game — [Raijin](https://raijin.gg/app/2740170/Horse_Racing_Manager); [GameGeeker](https://gamegeeker.com/games/horse-racing-manager-2740170) [LOW, aggregators]

**Derby Owners Club**
- It is remembered for the **horse-relationship loop** (trust meter, feeding, whip confidence) and its **physical-card persistence** — [TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/DerbyOwnersClub); [Bragging Rights Amusements](https://braggingrights.com/derby-owners-club-the-rarest-arcade-game-in-america-is-in-gainesville-fl-and-heres-how-to-play-it/)

### Inferences
- **Depth sells to the core audience, but only when outcomes feel like the result of player decisions.** Umamusume shows both sides: its depth is praised, and its RNG ("varies wildly even with optimal decisions") and P2W PvP are criticised. A server-authoritative, seeded engine with visible failure odds handles the RNG complaint better than hidden rolls do.
- **Timers are tolerated when they protect the player's time** ("they help me step away"), but resented when they gate content for sale. The Rival Stars desktop edition without timers is better received.
- **Scalable depth** (Starters Orders: "play simply or control everything") paired with **auto-defaults** (stable staff book jockeys) is how the deepest simulation keeps casual players.
- **A thin core loop is the most common long-term complaint** across Rival Stars and Umamusume. Lifecycle phases (racing, stud, foals) and event or discipline variety (Rival Stars' jumping) are what reviewers credit with reviving interest.

### Gaps
- **Reddit communities** (r/RivalStarsHorseRacing, r/UmaMusume, r/PhotoFinish) did not appear in any search result. Reddit sentiment is not represented; Steam discussions stand in for it.
- **Photo Finish Live:** no review or forum sentiment found.
- **ZED Champions:** no player sentiment found for the 2024+ relaunch.
- **Winning Post 10 and Derby Stallion:** no English review sentiment on horse-level systems.
- **App Store / Google Play** review text was not retrievable in this session.
- No GDC talk, Game Developer article or Deconstructor of Fun analysis on these games was found.
