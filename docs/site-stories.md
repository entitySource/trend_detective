# Site case files

Student-friendly case files for every investigation site, as shown in the app’s case-file panel.
Generated from `web/src/command/content.ts` by `node --experimental-strip-types web/scripts/site-stories.mjs`; edit that file, not this one.
Facts are context from the cited sources, rounded on purpose; the trend verdicts in the app come from our own analysis.

## **The whole planet: one big average**

*Whole world · planet · box -180, -90, 180, 90 (W, S, E, N)*

**Takeaway:** Averaging the entire Earth smooths out local ups and downs, so a trend that survives here is a big deal. Global temperature is the classic example.

**Key facts**

- Global temperature has risen about 0.2–0.3 °C every 10 years since 2000 (NASA GISTEMP).
- 2023 and 2024 were the two warmest years in the instrument record.
- Most other variables (rain, greenness, haze) go up in some places and down in others, so their global average can look flat.

**Why should you care?** A small change in the global average shows up as more extreme heatwaves, heavier downpours and shifting growing seasons where you live. It is also what climate targets like “1.5 °C” are measured against.

**Visual idea:** Warming stripes: one coloured bar per year from blue (cool) to red (warm).

## **The Arctic: the planet’s fastest-warming region**

*Arctic · polar · box -180, 66, 180, 90 (W, S, E, N)*

**Takeaway:** The Arctic is heating up about four times faster than the world as a whole. Melting ice exposes dark ocean, which soaks up more sunlight and warms things further.

**Key facts**

- Since 1979 the Arctic has warmed nearly four times faster than the global average (Rantanen et al. 2022).
- September sea ice, the yearly minimum, has shrunk by about 12% per decade since 1979 (NSIDC).
- This feedback loop is called “Arctic amplification”: like swapping a white T-shirt for a black one on a sunny day.

**Why should you care?** Arctic changes can nudge the jet stream that steers weather across North America, Europe and Asia. Melting land ice in the Arctic, especially Greenland, also raises sea level for every coastal city.

**Visual idea:** Two satellite snapshots of September sea ice side by side, 1980s vs today.

## **Greenland: a melting ice giant you can weigh from space**

*Greenland · ice sheet · box -55, 60, -20, 83 (W, S, E, N)*

**Takeaway:** NASA’s GRACE satellites literally weigh Greenland’s ice through tiny changes in gravity. It has been losing hundreds of billions of tonnes every year.

**Key facts**

- Greenland lost about 270 billion tonnes of ice per year between 2002 and 2023 (NASA GRACE/GRACE-FO).
- That alone raises global sea level by roughly 0.7 mm a year.
- If all of Greenland’s ice melted, seas would rise about 7 metres; that would take centuries, but the direction is clear.

**Why should you care?** Sea-level rise means more flooding in coastal cities from Mumbai to Miami, saltier farmland and costlier insurance. Melting ice far away still reaches your nearest coast.

**Visual idea:** A bar of “ice lost per year” compared with something familiar, like the weight of every car on Earth.

## **Eastern China: proof that clean-air laws work**

*Eastern China · megacity air · box 110, 28, 122, 40 (W, S, E, N)*

**Takeaway:** After years of record smog, China launched a national clean-air plan in 2013. Satellites saw the haze fall within a few years.

**Key facts**

- Fine-particle pollution (PM2.5) dropped by roughly a third across China between 2013 and 2017 (Zhang et al. 2019, PNAS).
- Coal plants were cleaned up or closed, and old trucks were taken off the roads.
- Haze is measured as aerosol optical depth: how much sunlight the particles block, like checking how dirty a window is.

**Why should you care?** Cleaner air means fewer asthma attacks and longer lives for hundreds of millions of people. It also shows that policy can bend a trend in under a decade.

**Visual idea:** Before/after satellite haze maps of eastern China, 2013 vs 2020.

## **The Indo-Gangetic Plain: greener fields, emptier aquifers**

*Indo-Gangetic Plain · farmland · box 75, 22, 88, 30 (W, S, E, N)*

**Takeaway:** This plain feeds hundreds of millions of people. Satellites show the fields getting greener while the groundwater underneath drains away.

**Key facts**

- GRACE satellites found northern India losing groundwater faster than almost anywhere on Earth (Rodell et al. 2009, 2018).
- India is one of the two biggest drivers of global “greening”, mostly from intensive farming (Chen et al. 2019).
- In winter, crop-stubble burning and traffic make it one of the haziest regions on the planet.

**Why should you care?** Much of India’s wheat and rice is grown here. If the groundwater runs low, food prices, farm jobs and drinking water for huge cities are all at risk.

**Visual idea:** A split graphic: green crops above ground, a falling water gauge below.

## **Delhi: a megacity under a winter blanket of smog**

*Delhi region · megacity air · box 76.5, 28, 77.8, 29 (W, S, E, N)*

**Takeaway:** Delhi regularly ranks among the most polluted capital cities in the world. Haze peaks every winter when cold, still air traps smoke and exhaust.

**Key facts**

- Smoke from crop burning in nearby states, traffic, construction dust and industry all add up.
- On the worst days, schools close and flights are delayed.
- Our grid is 0.5° (about 55 km), so the Delhi box covers only a few cells: expect a noisier series than for big regions.

**Why should you care?** Air pollution shortens lives and keeps kids indoors. Spotting whether the trend is improving tells us whether clean-air efforts are paying off.

**Visual idea:** A calendar heat map: each day coloured by haze level, with the winter peak standing out.

## **Europe: cleaner skies, hotter summers**

*Europe · temperate · box -10, 40, 30, 60 (W, S, E, N)*

**Takeaway:** Decades of emission rules have cleared Europe’s air. At the same time, Europe has become the fastest-warming continent.

**Key facts**

- Europe has warmed about twice as fast as the global average since the 1980s (WMO/Copernicus).
- Haze and acid-rain pollutants have dropped sharply since the 1990s.
- Twist: cleaner air lets more sunlight through, which adds a little extra warming.

**Why should you care?** Heatwaves like 2003 and 2022 caused thousands of deaths and damaged crops. Hotter summers change where people can comfortably live, work and travel.

**Visual idea:** Two lines on one chart: haze going down, temperature going up.

## **The Middle East: draining ancient groundwater**

*Middle East · desert · box 35, 20, 60, 37 (W, S, E, N)*

**Takeaway:** Rain is scarce, so farms and cities pump water from deep underground. GRACE shows that water disappearing much faster than it refills.

**Key facts**

- The Tigris–Euphrates region lost about 144 cubic kilometres of fresh water from 2003 to 2009, roughly the volume of the Dead Sea (Voss et al. 2013).
- Most of that loss was groundwater pumped after a severe drought.
- Fossil groundwater can take thousands of years to refill: like spending savings with no income.

**Why should you care?** Water shortages can raise food prices, push people to move and add tension between countries that share rivers.

**Visual idea:** A “water bank account” graphic: withdrawals far bigger than deposits.

## **California’s Central Valley: the ground is sinking**

*California Central Valley · farmland · box -122.5, 35, -118.5, 40.5 (W, S, E, N)*

**Takeaway:** This valley grows a huge share of America’s fruit, nuts and vegetables. During droughts farmers pump so much groundwater that the land itself sinks.

**Key facts**

- GRACE detected large groundwater losses here during the 2007–2009 and 2012–2016 droughts (Famiglietti et al. 2011).
- In some spots the ground has dropped by several metres over the last century as aquifers compacted.
- California grows about 80% of the world’s almonds, a very thirsty crop.

**Why should you care?** Next time almonds, avocados or tomatoes cost more, drought and groundwater may be part of the story.

**Visual idea:** A photo-style graphic of a pole marked with how far the ground has sunk over time.

## **The Amazon: a rainforest under drought pressure**

*Amazon · rainforest · box -70, -10, -50, 2 (W, S, E, N)*

**Takeaway:** The Amazon stores enormous amounts of carbon and makes much of its own rain. Recent record droughts and deforestation are testing how resilient it is.

**Key facts**

- Major droughts struck in 2005, 2010, 2015–16 and 2023–24; in 2023 the Rio Negro at Manaus hit its lowest level in over a century of records.
- The forest recycles its own rainfall: trees “breathe out” water vapour that falls again as rain further west.
- Scientists worry about a tipping point where parts could turn into dry savanna.

**Why should you care?** Rain made by the Amazon waters farms across South America, which supply soy, beef and coffee worldwide. Losing it would also release carbon that speeds up warming.

**Visual idea:** A river-level chart at Manaus with the record lows highlighted.

## **The Sahel: a comeback story at the Sahara’s edge**

*Sahel · desert edge · box -15, 10, 35, 18 (W, S, E, N)*

**Takeaway:** After devastating droughts in the 1970s and 80s, rainfall in the Sahel has partly recovered. Satellites have watched the land “re-green”.

**Key facts**

- Rainfall has partly recovered since the 1980s, though it now swings more between wet and dry years (Biasutti 2019).
- Vegetation greenness has increased across much of the region since the 1980s.
- Farmer-managed tree regrowth in Niger alone has restored millions of hectares.

**Why should you care?** Tens of millions of people here depend on rain-fed farming. A good or bad rainy season decides food supply, jobs and whether people need to migrate.

**Visual idea:** A rainfall bar chart from 1950 to today: the deep 1980s dip and the partial recovery.

## **The Strait of Malacca: when forest fires shut down a region**

*Southeast Asia (Strait of Malacca) · tropical coast · box 95, -6, 120, 6 (W, S, E, N)*

**Takeaway:** Peat swamps in Indonesia burn in dry years, sending thick smoke across one of the world’s busiest shipping lanes. Haze here spikes in El Niño years.

**Key facts**

- About a quarter of the world’s traded goods pass through the Strait of Malacca.
- The 2015 fires were among the worst on record, blanketing Singapore and Malaysia in smoke for weeks.
- Peat is ancient, carbon-rich soil: once it catches fire it can smoulder underground for months.

**Why should you care?** Haze closes schools and airports and harms health across several countries. Fires here also release huge amounts of carbon, which affects everyone’s climate.

**Visual idea:** A haze time series with El Niño years shaded, so students can spot the link.

## **Australia: a continent of extremes**

*Australia · dryland · box 115, -38, 153, -12 (W, S, E, N)*

**Takeaway:** Australia swings between long droughts and big floods. That makes it a great test of whether a trend is real or just a run of wet and dry years.

**Key facts**

- The “Millennium Drought” (about 1997–2009) dried out the south-east; floods followed in 2010–11.
- The 2019–20 “Black Summer” fires burned an area larger than many countries.
- Big natural swings mean trend tests here often say “not proven” even when a lot is happening.

**Why should you care?** Australia is a major food exporter, so its droughts ripple into global wheat and beef prices. Its fires and floods also show what more extreme weather looks like.

**Visual idea:** A water-storage line chart that zigzags between drought and flood years.
