# Race Structure, Calendars, Class/Handicap Systems and Multiplayer in Horse Racing Games

> **How these notes were gathered (read first).** On 14.10.2026 WebFetch failed with DNS errors on every domain tried (umamusu.wiki, gametora.com, uma.guide, goonhammer.com, thirdtimegames.com, medium.com, en.wikipedia.org), and direct `curl` was blocked by the proxy (HTTP 403 CONNECT). **Every finding below therefore comes from search-engine result summaries, not from reading the full pages.** The URLs are the pages those summaries named. Where a summary pooled several pages without saying which one made a claim, I say so. Treat exact numbers (thresholds, payouts, counts) as "reported by the cited page, not checked against the full text". Most ZED RUN and Pegaxy material is from 2021–2023, and the game has since changed.

## 1. Race types offered and how players are matched to appropriate races

### Takeaway
Successful games almost never let a horse pick any race freely. Horses go through a **free entry or maiden gate** (ZED Griffin + Discovery races; Umamusume Make Debut/Maiden; Photo Finish LIVE maiden races). Real-world-style race types then split the population into bands: claiming, allowance and stakes/graded races. Matching is by **class from recent results** (ZED points, Pegaxy class lobbies, Umamusume Team Trials weekly class), by **eligibility gates** (fan count, age, earnings over the last 28 days, team rank), or by **rating bands** (BHA-style handicaps in Starters Orders). The most reusable anti-sandbagging rule is ZED's **"you may race up a class, never down."** The most elegant economic one is Photo Finish LIVE's **claiming race**: a strong horse entered in a cheap race can be bought out at the claiming price.

### Cited Findings
**ZED RUN (2021–2023 sources; relaunched in 2025 as ZED Champions)**
- An unraced horse must first run a **free "Griffin" class race**. That race sets a base rating and a starting class. — [Sports Gambling Podcast – ZED RUN Beginners Guide (2021)](https://www.sportsgamblingpodcast.com/2021/06/11/zed-run-a-beginners-guide/); [Transak – Beginners Guide to ZED RUN](https://transak.com/blog/beginners-guide-to-zed-run-and-the-zed-token)
- After the Griffin race the horse runs a block of **"Discovery" races** before getting a permanent class. Sources disagree on the count: one says 9 more Discovery races, another says 10 races in total. — same two sources (conflict noted in the search summary)
- There are **six classes**. After every race a horse can move down a class, stay, or move up, depending on where it finished. **Points by finishing position** set the class movement, e.g. **1st = +4 … 12th = −4**. Fields are **12 horses**. — [Sports Gambling Podcast (2021)](https://www.sportsgamblingpodcast.com/2021/06/11/zed-run-a-beginners-guide/)
- **A horse may enter a race above its current class but not below it.** — [Sports Gambling Podcast (2021)](https://www.sportsgamblingpodcast.com/2021/06/11/zed-run-a-beginners-guide/)
- One 2021 guide maps Class 5 to a "Z rating" of 0–20, with Class 1 the highest class. The stated aim is to group horses of similar ability. — [Sports Gambling Podcast (2021)](https://www.sportsgamblingpodcast.com/?p=60214)
- **Free races** build stats and class standing. **Paid races** split the prize pool across 1st/2nd/3rd. Entry fees reportedly ranged from about **$2.50 to hundreds of dollars**. — [Sports Gambling Podcast (2021)](https://www.sportsgamblingpodcast.com/2021/06/11/zed-run-a-beginners-guide/); [IQ.wiki – ZED RUN](https://iq.wiki/wiki/zed-run)
- **Free tournaments:** a horse qualified for a tournament quarterfinal after **at least 5 races in a given "distance funnel"**. Only a top-3 finish from the quarterfinals onward paid out. — [Finder – ZED RUN introduces new tournament system](https://www.finder.com/ca/zed-run-introduces-new-tournament-system)
- **ZED Champions** (relaunch on the Base chain, around **April 2025**): the ZED token pays race entry, breeding, and upgrades/boosters. I found no rating or matchmaking specification for the relaunch. — [Decrypt (ES)](https://decrypt.co/es/317361/cripto-juego-nft-de-carreras-de-caballos-zed-run-renace-en-base-como-zed-champions/)

**Pegaxy (2021–2022 sources)**
- Entering a race puts the Pega into a **lobby of the same class**, which fills to **12 racers**. Players then get **60 seconds to inspect track variables and add gear**. Entry is **free**, and only **the top 3 earn VIS**. One review's example payout was 1st 105 / 2nd 44 / 3rd 26 VIS. — [Finder – Pegaxy review](https://www.finder.com/nfts/pegaxy-review); [DappRadar – Pegaxy](https://dappradar.com/blog/pegaxy-the-ultimate-mix-of-horse-racing-earning-and-ownership)
- VIS earned depends on **placing and the Pega's class**. I found no per-class table. — [RugDoc wiki – Pegaxy tokenomics](https://wiki.rugdoc.io/docs/the-tokenomics-of-pegaxy-explained/)

**Photo Finish LIVE (Third Time Entertainment; linked to Churchill Downs)**
- Horses get a **genetic grade from D (lowest) to SSS (highest)**. Races run from **entry-level maiden races up to premier graded stakes**. — [Third Time Games – Welcome to Photo Finish LIVE Part 2](https://thirdtimegames.com/?p=3744)
- **Claiming races:** any horse entered can be bought at the race's set claiming price, reported as **1,000 to 50,000+ DERBY** for core races. The guide warns that entering a horse worth far more than the claiming price is a bad idea. — [Third Time Games – A guide to claiming races](https://thirdtimegames.com/docs/racing-basics/a-guide-to-claiming-races/)
- The claiming price is **fixed when the race is scheduled**. **Bidding opens when the race locks**. If several players bid on the same horse, a **random draw** picks the new owner. — [Third Time Games – Introducing Photo Finish LIVE Claiming Races](https://thirdtimegames.com/introducing-photo-finish-live-claiming-races/)
- **Allowance races** sit between claiming and stakes races, and horses in them **are not for sale**. — [Third Time Games – Beginner's Guide to Allowance Races](https://thirdtimegames.com/?p=5976)
- Major races and qualifiers are restricted to **three-year-olds**. **Four new Free Entry Graded Races run every Saturday**. Some races use a **"selection committee"**. The most common selection method is **Immediate (first come, first served)**. Others decide eligibility from a horse's **earnings over the last 28 days on a given turn or surface**. — Third Time Games blog pages returned for this query ([?p=5976](https://thirdtimegames.com/?p=5976), [?p=5254](https://thirdtimegames.com/?p=5254)). *The summary did not say which of these posts makes each claim.*

**Umamusume: Pretty Derby (Career mode, single player)**
- Career ladder: **Make Debut / Maiden → Pre-OP → OP → G3 → G2 → G1**. After a Debut or Maiden win, standard races open up. **Some races require a minimum fan count; others are restricted by year (Classic/Senior)**. Reported fan rewards: Pre-OP/OP about 1,000–1,600, G3 about 1,800, G2 about 5,400, G1 the most. — [Deltia's Gaming – Optional Career Races Guide](https://deltiasgaming.com/?p=285570); [GameWith](https://gamewith.net/uma-musume/69671)
- Example entry gate: **Fillies' Revue (G2) requires 1,750+ fans**. Popular G1s (Tenno Sho, Arima Kinen) also need fans. — [Deltia's Gaming – Fillies' Revue Race Guide](https://deltiasgaming.com/?p=294039); [Goonhammer – Career Mode](https://www.goonhammer.com/getting-started-how-to-understand-career-mode-in-umamusume-pretty-derby)

**Umamusume PvP modes**
- **Team Trials:** **six weekly classes**, separate from Team Rank. A player is promoted by **finishing the weekly cycle above a promotion line that tracks the average score of players in that class**. Rewards are weekly. — [Deltia's Gaming – How to increase class levels in Team Trials](https://deltiasgaming.com/?p=286982); [Deltia's Gaming – Team Trials Explained](https://deltiasgaming.com/?p=281576)
- The Class 6 threshold **creeps upward over time** with the class average. A forum snapshot put the Class 6 retention line at about 476k points (stale data point). — [Deltia's Gaming – Class 6](https://deltiasgaming.com/?p=314416); [Coin-Return forum thread](https://forums.coin-return.org/threads/umamusume-pretty-derby-cinema-horses-and-oshi-stuff.1441/page-12)
- **Opponent matching in Team Trials is by Team Rank**, and opponents are **preset teams, not live players**. — [Game Rant – How Team Trials work](https://gamerant.com/umamusume-pretty-derby-team-trials-guide/)
- **Champions Meeting:** players pick **Open League** or **Graded League**. Open League allows only characters of **rank A+ or lower**, which caps the power level for weaker or newer accounts. Each event fixes the race conditions, e.g. **1600 m dirt, Tokyo, left-handed**. — [GameTora – Champions Meeting](https://gametora.com/umamusume/events/champions-meeting); [Umamusume Wiki](https://umamusu.wiki/Game:Champions_Meeting)
- **Room Match** requires a team rank of at least **E3**. — [Deltia's Gaming – Room Match Guide](https://deltiasgaming.com/?p=280538)

**Derby Stallion Masters (Japan, mobile, free-to-play)**
- In its **Breeders' Cup** mode players **register their best self-bred horse** and race worldwide rivals **under the same racing conditions**. — [Google Play – ダービースタリオン マスターズ](https://play.google.com/store/apps/details?id=jp.co.drecom.dabimas&hl=en_US); [GamingonPhone – Beginners Guide](https://gamingonphone.com/guides/derby-stallion-masters-beginners-guide-and-tips/)

**Starters Orders (PC/mobile management sim by Strategic Designs, since 2003)**
- SO6 lists **Group races, claiming races, handicaps, selling races, listed races** and advertises "accurate handicapping". — [Steam – Starters Orders 6](https://store.steampowered.com/app/2554790?l=malay)

**Real-world reference (UK BHA), used by sims like Starters Orders**
- A horse normally needs **three runs before it gets an initial rating**. Ratings are **updated weekly**. Handicap races are **limited to a rating band**: a horse rated above the band cannot enter. — [BHA – Guide to handicapping](https://www.britishhorseracing.com/regulation/guide-to-handicapping/); [Owners Group – BHA Ratings](https://www.ownersgroup.co.uk/Home/BHARatings)

### Inferences
- Three gating patterns recur, from mildest to most market-driven:
  - **(a) Performance class with up/down movement** (ZED points, Team Trials weekly promotion against the class average).
  - **(b) Eligibility gates** (fan count, age, earnings in the last 28 days, team/rank minimums).
  - **(c) Economic deterrents** (claiming races; free graded races reserved for qualifiers).
- At Sevdalısı already has (b): level brackets, breed classes and club-only races. It has no performance class yet (horse XP level measures training and experience, not form). A small **results-based class rating** would sort new and strong horses more fairly than level alone. Examples: a ZED-style ±points per finishing place, or a rolling rating updated weekly as in BHA.
- ZED's **"race up, never down"** rule is cheap to add to a table-based lobby and directly blocks sandbagging (a strong horse farming low tables).
- A **claiming-race table** suits a game that already has a market and escrow: the claim price is set at scheduling and bids open at lock. Real-money/NFT games use claiming as a market mechanic; in a soft-currency game it mainly deters putting an over-strong horse in a cheap race.
- A **"maiden" or debut race** (free or cheap, first races only) mirrors ZED Griffin, Umamusume Debut/Maiden and Photo Finish LIVE maiden races. It gives a new horse a safe first result and a provisional class.

### Gaps
- Current (2025–2026) ZED Champions class and matchmaking rules: none found.
- Pegaxy per-class payout tables and class thresholds: not found.
- Photo Finish (mobile, non-LIVE) class or star-rating structure: not found. Store listings only say "local derby up to the Cup".
- Horse Racing Manager series: **no sources found** on its race classes or matching.
- Exact Discovery race count for ZED: sources conflict (9 vs 10).

## 2. Handicap/weight systems and how they keep fields competitive

### Takeaway
True weight-for-rating handicapping shows up mainly in **realistic management sims** (Starters Orders, modelled on BHA rules). Arcade, gacha and NFT games instead keep fields competitive with **class bands, power caps and fixed conditions**: ZED/Pegaxy class lobbies, the Umamusume Open League "A+ or lower" cap, fixed per-event track/distance. The BHA model is simple: **1 rating point = 1 lb**, the top-rated horse carries the top weight, everyone else carries proportionally less, and the band edges are handled explicitly.

### Cited Findings
- **BHA rule:** each rating point is worth **one pound**. A horse rated 3 points higher should, in theory, carry 3 lb more for an equal chance. — [BHA – Guide to handicapping](https://www.britishhorseracing.com/regulation/guide-to-handicapping/)
- **Weights hang from the top weight**, which the race conditions set. The highest-rated horse carries it; the others carry less in proportion. Example: in a 50–70 band with a 10-stone top weight, a horse rated 69 carries 1 lb less than the 70-rated horse. — [BHA – How handicap weights are determined](https://www.britishhorseracing.com/?p=21685); [Owners Group](https://www.ownersgroup.co.uk/Home/BHARatings)
- **Band edges:** a horse rated **below** the band can run but carries the band's bottom weight ("out of the handicap", i.e. a disadvantage). A horse rated **1–2 lb above** the band can sometimes enter, but carries extra weight on top of the top weight. — [Geegeez – Handicap ratings in UK racing](https://www.geegeez.co.uk/handicap-ratings-in-uk-racing/amp/); [BHA](https://www.britishhorseracing.com/?p=21685)
- **Starters Orders 7** added a **French-style race and horse ratings option**, removed **Listed Handicaps** and introduced **Premiere handicaps**. A community post describes the handicap rating as "a floating start point for the living handicap" once a horse has its first rating, and points to the BHA guide. — [MobyGames – Starters Orders 7](https://mobygames.com/game/132503/starters-orders-7); [Starters Orders forum](https://www.startersorders.com/phpBB2/viewtopic.php?p=131778)
- **Umamusume Champions Meeting Open League** caps entrants at **rank A+ or lower**, a power cap instead of a weight. Every event fixes conditions (e.g. 1600 m dirt Tokyo left-handed), so builds are tuned to one known race. — [GameTora](https://gametora.com/umamusume/events/champions-meeting)
- **Umamusume Team Trials** randomises track conditions and weather across five race categories (Sprint, Mile, Medium and Long turf, plus Mile dirt). Rosters scale from 1 per distance up to **15 umas**. — [Goonhammer – Team Trials](https://www.goonhammer.com/understanding-team-trials-in-umamusume-pretty-derby); [Deltia's Gaming](https://deltiasgaming.com/?p=281576)
- **Pegaxy:** the 60-second pre-race window lets owners see the track variables and add gear before the start. Gear is a pre-race adjustment, not a handicap. — [Finder – Pegaxy review](https://www.finder.com/nfts/pegaxy-review)

### Inferences
- For At Sevdalısı, **weight-for-rating would have to go into the simulation engine**, and the engine is frozen under the project's determinism rule. A handicap would therefore have to live **outside** the engine. Options:
  - **(a) Rating bands** (already partly there as `horseLevelBrackets`; could be extended to a performance rating).
  - **(b) Bot strength scaled to the band** (already there via `raceClassBotStatRange` / `combineBotStatRanges`).
  - **(c) An "Open League"-style cap**: only horses at or below a rating may enter, keeping one ladder for new players.
- BHA's **edge rules** are a good template for keeping bands clean without a weight mechanic. In the game's terms: "above band → cannot enter; slightly above → may enter with a penalty". A penalty outside the engine could be a smaller prize share instead of extra weight.
- **Fixed per-event conditions** (one distance, surface and hippodrome per tournament, as in Champions Meeting) give players a known build target. They are cheap to do with the existing hippodrome and calendar `programs`.

### Gaps
- No source showed how Starters Orders actually converts ratings into in-race weight, or how strongly weight affects its simulation.
- No arcade, mobile or NFT game was found that uses a true weight handicap. That may reflect search limits rather than absence.

## 3. Race calendars: scheduled vs on-demand, frequency, race length, how results are presented

### Takeaway
The successful titles **mix three cadences**:
- **On-demand or continuously filling races**: Pegaxy and ZED lobbies fill to 12; Umamusume Team Trials can be played any time.
- **Fixed-schedule races at a predictable rhythm**: Photo Finish LIVE posts **new races every hour** and **four free graded races every Saturday**.
- **Periodic tournaments**: Umamusume Champions Meeting is a multi-day event with 2-day qualifier rounds and a final; Derby Stallion Masters has an annual championship with online qualifiers. ZED also had free tournaments.

Seasons that age horses (Photo Finish LIVE: about 4 weeks = 1 year of age) tie the calendar to horse life cycles.

### Cited Findings
- **Photo Finish LIVE:** "**New races every hour**". Races are split by **distance, surface, direction, condition and type**. — [photofinish.live – Race Schedule](https://photofinish.live/races)
- Photo Finish LIVE listings show a fee and a purse per race, e.g. **"Entry: 320.00" against a purse of 1.15K**. — [photofinish.live – race listing](https://photofinish.live/races/recommended/1c987949-dcdb-4de9-8067-9be9aa57fabc)
- Photo Finish LIVE **seasons last about 4 weeks**, and **all horses age one year at each season change**. — Third Time Games pages returned for this query ([Photo Finish LIVE](https://thirdtimegames.com/photo-finish-live/)); *page attribution approximate*
- Photo Finish LIVE runs **four new free-entry graded races each Saturday**. — Third Time Games blog ([?p=5976](https://thirdtimegames.com/?p=5976)); *attribution approximate*
- **Umamusume Champions Meeting:** three rounds; the **first two are qualifiers lasting two days each**; **up to 4 attempts per day, 5 races per attempt** (max 8 per round); **only the best attempt counts**. — [GameTora – Champions Meeting](https://gametora.com/umamusume/events/champions-meeting)
- Champions Meeting advancement:
  - **Round 1:** ≥3 wins in any attempt → Round 2 Group A; fewer → Group B.
  - **Round 2:** Group A with ≥3 wins → A Finals; 1–2 wins in A, or ≥1 win in B → B Finals; 0 wins in B → eliminated.
  - **Final:** one race.
  - Sources disagree in places. — [GameTora](https://gametora.com/umamusume/events/champions-meeting); [uma.guide – CM Basics](https://uma.guide/guides/beginners-cm); [Game8 – Champions Meeting Guide](https://game8.co/games/Umamusume-Pretty-Derby/archives/541155); [Umamusume Wiki](https://umamusu.wiki/Game:Champions_Meeting)
- Champions Meeting entry cost: uma.guide says the **first entry is free, 2 extra free entries come from daily event participation, and the final entry costs 30 Carats**. Game8 says **up to 4 free entries per day, after which an entry ticket or 30 Carats is needed**. (Conflict; rules may differ per event.) — [uma.guide](https://uma.guide/guides/beginners-cm); [Game8](https://game8.co/games/Umamusume-Pretty-Derby/archives/541155)
- **Umamusume Career calendar:** each race sits in a fixed slot of a 3-year career. Example: **Yasuda Kinen (G1, Tokyo turf mile) is in June of Senior Year**, so a run gets one natural chance at it. Hakodate Junior Stakes (G3) is in late July of Year 1. — [GeekChamp – Yasuda Kinen](https://geekchamp.com/how-to-earn-the-spring-g1-celebrations-part-2-yasuda-kinen-event-rewards-in-umamusume-pretty-derby/); [Deltia's Gaming – Hakodate races](https://deltiasgaming.com/?p=314577)
- **Derby Stallion Masters:** the **9th Dabimas Championship final was held on 20 March 2026**. **18 owners** who came through online qualifying rounds raced **two races scored on cumulative placement points**. — [Have a Good Holiday – DSM 9th Championship](https://www.haveagood-holiday.com/en/articles/derby-stallion-masters-9th-championship)
- **Starters Orders 8** lists "**improved race schedules**" and "**1 click horse entry**". — [Steam – Starters Orders](https://store.steampowered.com/app/2765880?l=malay)
- **Derby Owners Club (online/F2P edition, 2013):** a 2017 update added an "**Owners CUP**" event and a fast race option, "**サクサクレース (Saku Saku Race)**". — [4Gamer – Derby Owners Club](https://www.4gamer.net/games/210/G021034/)
- **Pegaxy:** races start **when the class lobby fills to 12**, followed by the 60-second prep window. — [Finder](https://www.finder.com/nfts/pegaxy-review)
- **Results presentation:** NFT games show the race as an animated 3D replay of a server result. An Umamusume player asked for **batch matchmaking so they could skip watching their team lose**. — [Steam – "Champion meetings are terrible"](https://steamcommunity.com/app/3224770/discussions/0/842866071372456047/)

### Inferences
- An **hourly or regular rhythm of scheduled races plus a weekly "free graded" showcase** (Photo Finish LIVE) maps directly onto the existing `calendar.programs`, `featured` and `horizonHours`. The Sunday derby already follows this pattern.
- A **qualifier-then-final tournament with "best attempt counts" and limited daily attempts** (Champions Meeting) lets players compete **asynchronously over days** but still crowns a winner at a fixed time. This is a strong fit for low concurrency: no one has to be online at the same moment until the final. Even the final can run on registered snapshots (see §5).
- Players value a **fast or skip result option** (DOC's "Saku Saku Race", the Umamusume skip request). The existing 2× `timeScale` is a start; a "result only" path for repeated practice runs would answer the same complaint.
- **Seasons that age horses** (about 4 weeks = 1 year) create a natural calendar beat (3-year-old races, retirements). The game has seasons, but nothing ties age progression to them.

### Gaps
- Typical race duration (wall-clock seconds of the replay) was not stated for any game in the snippets found.
- No source detailed how ZED or Photo Finish LIVE present results (photo finish, replays, live 3D) beyond "races are 3D animated".
- Rival Stars and Photo Finish (mobile) event calendars: only "regular live events" and "weekly leaderboards" were confirmed.

## 4. How much the player controls during a race; skill vs stats; fairness and randomness/upset rate

### Takeaway
There is a clear spectrum:
- **Live dexterity control**: Rival Stars uses rhythm-timed sprint taps plus a stamina/sprint gauge that fills while the horse holds its preferred position. Derby Owners Club uses two buttons (reins/whip), where over-whipping costs the horse's confidence and whip timing depends on horse type.
- **Pre-race only**: Umamusume (build, skills, running style), Pegaxy (gear chosen in a 60-second window), ZED and Photo Finish LIVE (pure stats/genetics and race choice).

NFT games are openly described as **RNG-heavy** (Pegaxy "RNG primarily decides"). In Umamusume, perceived RNG and whale advantage are the top complaints.

### Cited Findings
- **Rival Stars (PC):** the **space bar sprints and must be timed to a flashing indicator**. Tapping too fast gives a **"too fast/too quick" warning that drains stamina**. A steady rhythm beats mashing. **S slows the horse** to keep it in its optimal zone. — [Steam discussion – "I don't get the hang of winning a race"](https://steamcommunity.com/app/1166860/discussions/0/3056237966705491116/)
- **Rival Stars:** **sprint energy builds while the horse stays in its preferred position ("green area")**. Sprinting early is the common mistake. Guides advise saving the final sprint for roughly the last 400 yd / 200 m and staying within 1–2 lengths of the leader in hard races. — [LevelWinner – Rival Stars guide](https://www.levelwinner.com/rival-stars-horse-racing-guide-tips-cheats-tricks/); [Gamezebo – Rival Stars guide](https://www.gamezebo.com/walkthroughs/rival-stars-horse-racing-guide-tips-cheats-and-strategies/) (*the search summary noted these tips are several years old*)
- **Rival Stars VR edition:** energy is gained by moving the controllers in a smooth up-and-down motion; sprinting uses a smooth back-and-forth motion. — [PikPok FAQ – VR Edition controls](https://faq.pikpok.com/hc/en-nz/articles/46118431075609-Rival-Stars-Horse-Racing-VR-Edition-FAQ-Controls-Help)
- **Rival Stars:** races show **odds**, and players **hire jockeys**. — [Equine on the Mind – Rival Stars review (iOS)](https://equineonthemind.com/quite-possibly-the-best-horse-game-a-rival-stars-horse-racing-review-ios-version/)
- **Derby Owners Club (Sega AM3, 1999, NAOMI):** during the race players press **a red button to pull the reins and a green button to use the whip**. **Whipping too much makes the horse lose confidence in the player**. **Whip timing must suit the horse type (front runner vs stretch runner)**. Prize money scales with finishing position. — [Wikipedia – Derby Owners Club](https://en.wikipedia.org/wiki/Derby_Owners_Club); [America's Best Racing – arcade retrospective](https://www.americasbestracing.net/lifestyle/2017-youre-not-arcade-geek-unless-you-played-game); [Sega Retro](https://segaretro.org/Derby_Owners_Club)
- **DOC** training is **ten mini-games** that build Starting, Cornering, Out of the Box, Tenacity, Competitiveness and Spurt. After the race an **"owner" multiple-choice question** tests the player's understanding of the horse, and a wrong answer hurts the horse–player relationship. One reviewer felt the rest of the result came down to breeding, training and conditioning. — [Wikipedia](https://en.wikipedia.org/wiki/Derby_Owners_Club); [America's Best Racing](https://www.americasbestracing.net/lifestyle/2017-youre-not-arcade-geek-unless-you-played-game)
- **Pegaxy:** a review says **a random number generator primarily decides race results**. — [Finder – Pegaxy review](https://www.finder.com/nfts/pegaxy-review)
- **Umamusume Team Trials** scoring rewards placement (**big bonuses when all teammates finish top 3 / top 5**) and **skill activations** (unique > rare > normal). Picking the **hardest of three offered opponents gives a score bonus on a win**. — [Deltia's Gaming – Team Trials](https://deltiasgaming.com/?p=281576); [Game Rant](https://gamerant.com/umamusume-pretty-derby-team-trials-guide/)
- **Umamusume Champions Meeting:** a fan wiki argues that real-time matching is not decisive because results depend on team stats, but notes **the general opinion that real-time matching can significantly affect results**. — [NamuWiki – Champions Meeting](https://en.namu.wiki/w/%EC%9A%B0%EB%A7%88%EB%AC%B4%EC%8A%A4%EB%A9%94%20%ED%94%84%EB%A6%AC%ED%8B%B0%20%EB%8D%94%EB%B9%84/%EC%9D%B4%EB%B2%A4%ED%8A%B8/%EC%B1%94%ED%94%BC%EC%96%B8%EC%8A%A4%20%EB%AF%B8%ED%8C%85)
- **Winning Post 10 2024** (Koei Tecmo, released 28 March 2024, PC/PS/Switch, single-player only) is an owner-breeder sim. Its "**uma-sonality**" personality system changes as horses grow, so player decisions shape outcomes. — [Steam – Winning Post 10](https://store.steampowered.com/app/2124680/Winning_Post_10)

### Inferences
- At Sevdalısı's "drive the horse yourself" (unlimited whip with stamina burn and permanent fatigue; "calm" banks stamina; left/right) sits between DOC and Rival Stars. Two ideas tested by those games:
  - **(a) A cost for over-whipping that goes beyond stamina.** DOC lowers horse confidence/trust. That would fit the existing hidden personality trait `obedience` (applied outside the engine, e.g. a persistent relationship stat).
  - **(b) A positional "sweet spot" that charges a sprint gauge** (Rival Stars). This rewards the running style that suits the horse, not just whip timing. It would be an engine change and needs the determinism and fingerprint locks.
- DOC's **owner quiz** and **horse-type-dependent whip timing** are low-cost ways to make **knowing your horse** a skill without live dexterity. That suits a web game where many players race asynchronously.
- Perceived fairness hinges on **explaining the result**. At Sevdalısı already exposes frozen `startingStats`; adding a short "why you lost" breakdown (pace, fatigue, position) would answer the "RNG decided" perception that hurts Pegaxy and Umamusume.

### Gaps
- No published **upset rates** or favourite-win percentages were found for any game. The project's own `RACE_BALANCE_REPORT.md` is the only measured source.
- Exactly how much the Rival Stars in-race input outweighs horse stats in multiplayer: not documented.
- Photo Finish LIVE in-race control: none was described in the snippets. It appears to be stats plus race selection only (not verified).

## 5. Multiplayer: async vs real-time PvP, leagues, ladders, clubs; staying playable solo or at low concurrency

### Takeaway
The healthiest pattern is **"real-time if possible, async snapshot otherwise"**:
- **Umamusume Champions Meeting** tries live matchmaking (3 players × 3 umas = 9 runners). If matching takes too long, it falls back to **teams that other players previously registered in the same group and round**.
- **Team Trials** is fully async against preset teams, with a weekly ladder.
- **Room Match** fills empty slots with **NPCs**.
- **Derby Stallion Masters** runs online cups on **registered best horses**.
- Only NFT games (ZED, Pegaxy) **wait for 12 real horses**. That depends on a large, financially motivated population.

### Cited Findings
- **Champions Meeting room:** each player fields **3 characters** and is **randomly matched with 2 other players**, giving **9 runners**. — [GameTora](https://gametora.com/umamusume/events/champions-meeting); [Umamusume.gg – Sagittarius Cup](https://umamusume.gg/the-race-event-champions-meeting-sagittarius-cup-is-here)
- **Fallback:** "if it takes too long to find a match, you will instead be matched with other trainers who have **previously registered in the same group and round**." One player reported that **people raced against their umas while they were asleep**. — [Umamusume.gg – Sagittarius Cup](https://umamusume.gg/the-race-event-champions-meeting-sagittarius-cup-is-here); [NamuWiki](https://en.namu.wiki/w/%EC%9A%B0%EB%A7%88%EB%AC%B4%EC%8A%A4%EB%A9%94%20%ED%94%84%EB%A6%AC%ED%8B%B0%20%EB%8D%94%EB%B9%84/%EC%9D%B4%EB%B2%A4%ED%8A%B8/%EC%B1%94%ED%94%BC%EC%96%B8%EC%8A%A4%20%EB%AF%B8%ED%8C%85)
- The **CM final is the only round not matched in real time**, and teams are locked into their brackets once they enter it. — [GameTora](https://gametora.com/umamusume/events/champions-meeting); [Game8](https://game8.co/games/Umamusume-Pretty-Derby/archives/541155)
- **Team Trials (async ladder):** the player is shown **three opponents** (with a refresh option) and races their **preset team**, not a live player. Matching is by **Team Rank**. A **weekly class (1–6)** promotes against a moving class-average line. More class levels unlock more roster slots (second row at Class 2, third at Class 3). — [Game Rant](https://gamerant.com/umamusume-pretty-derby-team-trials-guide/); [Deltia's Gaming](https://deltiasgaming.com/?p=286982)
- **Room Match (custom lobbies):** each player enters **1–3 characters**; **if slots are not filled, NPCs race**. The host picks a premade G1 track or builds a custom "Trainer's Cup" (turf/dirt, sprint to long, venue). **No Monies rewards** are given. — [Deltia's Gaming – Room Match Guide](https://deltiasgaming.com/?p=280538)
- **Derby Stallion Masters:** in the **Breeders' Cup** players register their best self-bred horse and compete against worldwide rivals. **Friendly matches with friends give no rewards**. The competitive top tier is an **annual championship** whose online qualifiers feed an 18-owner live final. — [GamingonPhone](https://gamingonphone.com/guides/derby-stallion-masters-beginners-guide-and-tips/); [Have a Good Holiday](https://www.haveagood-holiday.com/en/articles/derby-stallion-masters-9th-championship)
- **DSM English service** reportedly **ended on 11 April 2022**, while the Japanese version still runs (2026 championship). — [TouchArcade – Derby Stallion: Masters](https://toucharcade.com/games/derby-stallion-masters); [Have a Good Holiday](https://www.haveagood-holiday.com/en/articles/derby-stallion-masters-9th-championship)
- **Rival Stars:** story mode plus online multiplayer. **Update 1.40 (Nov 2025)** added multiplayer and show jumping, with **up to 8 players in Free Roam**. On desktop, players report **live racing against online players**, but the mobile-style **live events are not on desktop**. Mobile has **regular multiplayer live events and team challenges**. **Show-jumping live events returned in 2026 with weekly leaderboards**. — [Comfy Cozy Gaming – 1.40 update (2025-11-22)](https://www.comfycozygaming.com/2025/11/22/rival-stars-gets-multiplayer/); [Steam – Multiplayer discussion](https://steamcommunity.com/app/1166860/discussions/0/3056237435844900720/); [Rival Stars – News](https://www.rivalstarshorseracing.com/news); [PlayStation Store](https://store.playstation.com/en-us/concept/10017410)
- Rival Stars **Cross Country has a global leaderboard** (an async time-trial-style competition). — [Steam – Rival Stars Horse Racing](https://store.steampowered.com/app/1166860)
- A **"ranked mode with global leaderboards"** for Rival Stars appeared **only on a mod-APK site** (unreliable, unverified). — [9mod (unreliable)](https://9mod.com/rival-stars-horse-racing.html)
- **Photo Finish (mobile):** "Race online against players", "**Triple your rewards in online stakes**", plus breeder/jockey/Cup championships and head-to-head races. — [App Store – Photo Finish Horse Racing](https://apps.apple.com/us/app/-/id993764346); [Google Play](https://play.google.com/store/apps/details?id=com.thirdtime.derbyking&hl=en_CA); [BlueStacks](https://www.bluestacks.com/campaign/com.thirdtime.derbyking/en)
- **Pegaxy:** waits until the same-class lobby has **12 racers** (no bot fill is described). — [Finder](https://www.finder.com/nfts/pegaxy-review)
- **Derby Owners Club** stores each horse on a **card** that can be scanned at any cabinet, a portable save that works across sessions. — [Wikipedia](https://en.wikipedia.org/wiki/Derby_Owners_Club)
- **Umamusume clubs:** competitive clubs set entry requirements for certain cards/legacies, and prestige motivates them. — [Steam – "What are P2W whales winning in Taurus Cup?"](https://steamcommunity.com/app/3224770/discussions/0/597409652103486184/)
- **Winning Post 10 2024** is **single-player only**. — [Steam](https://store.steampowered.com/app/2124680/Winning_Post_10)

### Inferences
- **The most transferable pattern for At Sevdalısı is the Champions Meeting fallback: fill empty gates with snapshots of other real players' horses (a "ghost" entry built from their registered horse and tactic), not anonymous bots.** The project already freezes `horse_snapshot` at lock and fills fields with seeded bots (`generateBotEntrants`). A ghost entrant would make low-concurrency races feel populated by real stables. Rules needed:
  - **Prize handling:** under the "bot share burns" policy, a ghost's prize should also burn, or be paid only as a small, non-transferable reward to the absent owner. Paying the full prize would create a value-transfer channel; the project's anti-cheat notes in (47) already flag multi-account value transfer as the residual risk.
  - **Determinism:** ghosts must be chosen from the seed (e.g. via `deriveRandom`), never `Math.random`.
- An **async weekly ladder** (Team Trials) suits a small player base. Players race preset opponents at any time; score above a moving class average to promote. It works with **zero simultaneous players**. The existing weekly/monthly leaderboards are derived from race records and could feed a class.
- **Room Match** shows the expected social-room behaviour: **NPC fill plus no currency rewards** in custom rooms, which removes the incentive to farm private rooms. That matches the project's club-only races with no extra prize.
- **Qualifiers async, final at a fixed time** (DSM championship, CM) creates a "big night" without needing everyone online all week.

### Gaps
- No source gave concurrency numbers, or how long Champions Meeting waits before the fallback kicks in.
- How Rival Stars online races handle a field that is short of humans (AI fill or not): not documented.
- Photo Finish LIVE field size and whether unfilled races are cancelled or filled: not found.
- Derby Owners Club cabinet CPU-horse fill: no source found (one search returned nothing relevant).

## 6. Common player complaints about race fairness, pay-to-win and matchmaking

### Takeaway
The recurring complaints:
- **(1) New or weak horses matched against top horses in the same class**: ZED, which led to proposals for win-rate-based classes and a maiden tier.
- **(2) RNG deciding results**: Pegaxy, Umamusume CM.
- **(3) Spenders/whales dominating PvP**: Umamusume gacha. F2P players dispute this, saying early planning makes CM fair.
- **(4) Opaque or sudden system changes destroying horse value**: ZED Breeding 3.0 / EVO.
- **(5) Having to watch your own losses**: requests for batch or skip results.

### Cited Findings
- **ZED (2021):** "A lot of new racers frustrated with the class system in which their donkey faces some of the top breeds in Class V or IV". The author proposed a **win-rate-based class structure with a Griffin (maiden-style) tier**. — [degen NFTs – A Modest Proposal to ZED RUN's Class Structure](https://degennfts.medium.com/a-modest-proposal-to-zed-runs-class-structure-a8eec3383998)
- **ZED (2023):** a player blog calls the **sudden switch to Breeding 3.0** the platform's main problem: it devalued well-bred horses. The same author **praises the class system** for "giving every single horse a chance to succeed", and says the long-term effects of the **EVO system were poorly explained**. — [Queen Bean Racing – ZED RUN in 2023 and beyond](https://medium.com/@queenbeanracing/zed-run-in-2023-and-beyond-8d68493e9d24)
- **Pegaxy:** RNG primarily decides results (reviewer's characterisation). — [Finder](https://www.finder.com/nfts/pegaxy-review)
- **Umamusume CM (Steam, roughly 2025):** "I spent hours training decent umas only to lose to either rng and super stacked whale/min-maxer meta team… I don't need to see my team lose either." The poster asked for **batch matchmaking** to skip watching. — [Steam – "Champion meetings are terrible"](https://steamcommunity.com/app/3224770/discussions/0/842866071372456047/)
- **Umamusume P2W:** "You really need to spend at least 50 pull on average to maybe even draw a SSR… Then comes CM which really shows how big of a gap it is." — [Steam – "pay to win"](https://steamcommunity.com/app/3224770/discussions/0/597410050678498888/)
- **Counterpoint:** F2P players say key support cards (Kitasan Black, Super Creek) were obtainable through rerolls and free carats, so "free-to-play had a fair chance, if you were smart early on". One prepared three weeks ahead and did well. Others replied that spending still gives an edge. — [Steam – Taurus Cup thread](https://steamcommunity.com/app/3224770/discussions/0/597409652103486184/)
- **Champions Meeting Open League** (rank A+ cap) works as a structural answer to "whales in my bracket". — [GameTora](https://gametora.com/umamusume/events/champions-meeting)
- **Real-time vs fallback matching** is seen by many players as affecting results, even though the wiki argues stats decide. — [NamuWiki](https://en.namu.wiki/w/%EC%9A%B0%EB%A7%88%EB%AC%B4%EC%8A%A4%EB%A9%94%20%ED%94%84%EB%A6%AC%ED%8B%B0%20%EB%8D%94%EB%B9%84/%EC%9D%B4%EB%B2%A4%ED%8A%B8/%EC%B1%94%ED%94%BC%EC%96%B8%EC%8A%A4%20%EB%AF%B8%ED%8C%85)
- **Photo Finish LIVE claiming risk** is spelled out to players ("if your horse is worth far more than that, it's probably a bad idea to enter this race"). The fairness trade-off is made explicit, not hidden. — [Third Time Games – claiming races guide](https://thirdtimegames.com/docs/racing-basics/a-guide-to-claiming-races/)
- I found **no reliable reporting** that ZED RUN races were rigged or bot-driven. The one "rigged" lawsuit in the results (October 2025) concerns US racetrack betting, not ZED. — [Barchart – Hagens Berman class action](https://www.barchart.com/story/news/35662376/hagens-berman-class-action-lawsuit-unveils-massive-ai-horse-betting-manipulation-scheme)

### Inferences
- At Sevdalısı already avoids the worst P2W pattern: the gem policy is cosmetics and convenience only, and stronger breeds cost **in-game coins plus a level requirement**. The ZED complaint (new horses against top breeds) still applies through **breed strength**, because the free starter horse is the weakest breed. The project's answers so far are breed classes (Yerli/Native) and level brackets. A results-based class (§1) plus an Open-League-style cap would close the gap further.
- **Explain changes before they hit horse value.** The ZED backlash came from sudden, poorly explained system changes. Any future balance change to breeds, personality or the engine should ship with a changelog shown to players (frozen-snapshot replays already protect past results).
- Offer a **"skip to result" or batch-run** option for practice and repeated races to answer the "don't make me watch my loss" complaint.

### Gaps
- No Reddit threads were returned (the summaries noted this). Complaint coverage leans on Steam forums and Medium posts.
- No quantitative churn or retention data linking fairness complaints to player loss was found for any title.
- Rival Stars and Photo Finish fairness complaints were not surfaced. App store reviews were seen only through listing snippets.
