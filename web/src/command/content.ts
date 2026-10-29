// Student-facing content for the command center: sites with their case files, plain definitions,
// research leads and demo scripts. Facts are from published sources named in each case file;
// numbers are rounded on purpose ("about") because they are context, not our own results.

export type Biome =
  | 'planet'
  | 'polar'
  | 'ice sheet'
  | 'megacity air'
  | 'farmland'
  | 'temperate'
  | 'rainforest'
  | 'desert edge'
  | 'desert'
  | 'dryland'
  | 'tropical coast'

export type Story = {
  headline: string
  takeaway: string
  facts: string[]
  why: string
  visual: string
}

// bbox = [west, south, east, north], the averaging box in pipeline/td/regions.py.
export type Site = { id: string; name: string; lat: number; lon: number; biome: Biome; bbox: [number, number, number, number]; story: Story }

export const SITES: Site[] = [
  {
    id: 'glb',
    name: 'Whole world',
    lat: 0,
    lon: 0,
    biome: 'planet',
    bbox: [-180, -90, 180, 90],
    story: {
      headline: 'The whole planet: one big average',
      takeaway: 'Averaging the entire Earth smooths out local ups and downs, so a trend that survives here is a big deal. Global temperature is the classic example.',
      facts: [
        'Global temperature has risen about 0.2–0.3 °C every 10 years since 2000 (NASA GISTEMP).',
        '2023 and 2024 were the two warmest years in the instrument record.',
        'Most other variables (rain, greenness, haze) go up in some places and down in others, so their global average can look flat.',
      ],
      why: 'A small change in the global average shows up as more extreme heatwaves, heavier downpours and shifting growing seasons where you live. It is also what climate targets like “1.5 °C” are measured against.',
      visual: 'Warming stripes: one coloured bar per year from blue (cool) to red (warm).',
    },
  },
  {
    id: 'arc',
    name: 'Arctic',
    lat: 78,
    lon: 0,
    biome: 'polar',
    bbox: [-180, 66, 180, 90],
    story: {
      headline: 'The Arctic: the planet’s fastest-warming region',
      takeaway: 'The Arctic is heating up about four times faster than the world as a whole. Melting ice exposes dark ocean, which soaks up more sunlight and warms things further.',
      facts: [
        'Since 1979 the Arctic has warmed nearly four times faster than the global average (Rantanen et al. 2022).',
        'September sea ice, the yearly minimum, has shrunk by about 12% per decade since 1979 (NSIDC).',
        'This feedback loop is called “Arctic amplification”: like swapping a white T-shirt for a black one on a sunny day.',
      ],
      why: 'Arctic changes can nudge the jet stream that steers weather across North America, Europe and Asia. Melting land ice in the Arctic, especially Greenland, also raises sea level for every coastal city.',
      visual: 'Two satellite snapshots of September sea ice side by side, 1980s vs today.',
    },
  },
  {
    id: 'grl',
    name: 'Greenland',
    lat: 72,
    lon: -40,
    biome: 'ice sheet',
    bbox: [-55, 60, -20, 83],
    story: {
      headline: 'Greenland: a melting ice giant you can weigh from space',
      takeaway: 'NASA’s GRACE satellites literally weigh Greenland’s ice through tiny changes in gravity. It has been losing hundreds of billions of tonnes every year.',
      facts: [
        'Greenland lost about 270 billion tonnes of ice per year between 2002 and 2023 (NASA GRACE/GRACE-FO).',
        'That alone raises global sea level by roughly 0.7 mm a year.',
        'If all of Greenland’s ice melted, seas would rise about 7 metres; that would take centuries, but the direction is clear.',
      ],
      why: 'Sea-level rise means more flooding in coastal cities from Mumbai to Miami, saltier farmland and costlier insurance. Melting ice far away still reaches your nearest coast.',
      visual: 'A bar of “ice lost per year” compared with something familiar, like the weight of every car on Earth.',
    },
  },
  {
    id: 'eas',
    name: 'Eastern China',
    lat: 34,
    lon: 116,
    biome: 'megacity air',
    bbox: [110, 28, 122, 40],
    story: {
      headline: 'Eastern China: proof that clean-air laws work',
      takeaway: 'After years of record smog, China launched a national clean-air plan in 2013. Satellites saw the haze fall within a few years.',
      facts: [
        'Fine-particle pollution (PM2.5) dropped by roughly a third across China between 2013 and 2017 (Zhang et al. 2019, PNAS).',
        'Coal plants were cleaned up or closed, and old trucks were taken off the roads.',
        'Haze is measured as aerosol optical depth: how much sunlight the particles block, like checking how dirty a window is.',
      ],
      why: 'Cleaner air means fewer asthma attacks and longer lives for hundreds of millions of people. It also shows that policy can bend a trend in under a decade.',
      visual: 'Before/after satellite haze maps of eastern China, 2013 vs 2020.',
    },
  },
  {
    id: 'igp',
    name: 'Indo-Gangetic Plain',
    lat: 26,
    lon: 81.5,
    biome: 'farmland',
    bbox: [75, 22, 88, 30],
    story: {
      headline: 'The Indo-Gangetic Plain: greener fields, emptier aquifers',
      takeaway: 'This plain feeds hundreds of millions of people. Satellites show the fields getting greener while the groundwater underneath drains away.',
      facts: [
        'GRACE satellites found northern India losing groundwater faster than almost anywhere on Earth (Rodell et al. 2009, 2018).',
        'India is one of the two biggest drivers of global “greening”, mostly from intensive farming (Chen et al. 2019).',
        'In winter, crop-stubble burning and traffic make it one of the haziest regions on the planet.',
      ],
      why: 'Much of India’s wheat and rice is grown here. If the groundwater runs low, food prices, farm jobs and drinking water for huge cities are all at risk.',
      visual: 'A split graphic: green crops above ground, a falling water gauge below.',
    },
  },
  {
    id: 'del',
    name: 'Delhi region',
    lat: 28.5,
    lon: 77.2,
    biome: 'megacity air',
    bbox: [76.5, 28, 77.8, 29],
    story: {
      headline: 'Delhi: a megacity under a winter blanket of smog',
      takeaway: 'Delhi regularly ranks among the most polluted capital cities in the world. Haze peaks every winter when cold, still air traps smoke and exhaust.',
      facts: [
        'Smoke from crop burning in nearby states, traffic, construction dust and industry all add up.',
        'On the worst days, schools close and flights are delayed.',
        'Our grid is 0.5° (about 55 km), so the Delhi box covers only a few cells: expect a noisier series than for big regions.',
      ],
      why: 'Air pollution shortens lives and keeps kids indoors. Spotting whether the trend is improving tells us whether clean-air efforts are paying off.',
      visual: 'A calendar heat map: each day coloured by haze level, with the winter peak standing out.',
    },
  },
  {
    id: 'eur',
    name: 'Europe',
    lat: 50,
    lon: 10,
    biome: 'temperate',
    bbox: [-10, 40, 30, 60],
    story: {
      headline: 'Europe: cleaner skies, hotter summers',
      takeaway: 'Decades of emission rules have cleared Europe’s air. At the same time, Europe has become the fastest-warming continent.',
      facts: [
        'Europe has warmed about twice as fast as the global average since the 1980s (WMO/Copernicus).',
        'Haze and acid-rain pollutants have dropped sharply since the 1990s.',
        'Twist: cleaner air lets more sunlight through, which adds a little extra warming.',
      ],
      why: 'Heatwaves like 2003 and 2022 caused thousands of deaths and damaged crops. Hotter summers change where people can comfortably live, work and travel.',
      visual: 'Two lines on one chart: haze going down, temperature going up.',
    },
  },
  {
    id: 'mde',
    name: 'Middle East',
    lat: 29,
    lon: 47,
    biome: 'desert',
    bbox: [35, 20, 60, 37],
    story: {
      headline: 'The Middle East: draining ancient groundwater',
      takeaway: 'Rain is scarce, so farms and cities pump water from deep underground. GRACE shows that water disappearing much faster than it refills.',
      facts: [
        'The Tigris–Euphrates region lost about 144 cubic kilometres of fresh water from 2003 to 2009, roughly the volume of the Dead Sea (Voss et al. 2013).',
        'Most of that loss was groundwater pumped after a severe drought.',
        'Fossil groundwater can take thousands of years to refill: like spending savings with no income.',
      ],
      why: 'Water shortages can raise food prices, push people to move and add tension between countries that share rivers.',
      visual: 'A “water bank account” graphic: withdrawals far bigger than deposits.',
    },
  },
  {
    id: 'cvy',
    name: 'California Central Valley',
    lat: 37.5,
    lon: -120.5,
    biome: 'farmland',
    bbox: [-122.5, 35, -118.5, 40.5],
    story: {
      headline: 'California’s Central Valley: the ground is sinking',
      takeaway: 'This valley grows a huge share of America’s fruit, nuts and vegetables. During droughts farmers pump so much groundwater that the land itself sinks.',
      facts: [
        'GRACE detected large groundwater losses here during the 2007–2009 and 2012–2016 droughts (Famiglietti et al. 2011).',
        'In some spots the ground has dropped by several metres over the last century as aquifers compacted.',
        'California grows about 80% of the world’s almonds, a very thirsty crop.',
      ],
      why: 'Next time almonds, avocados or tomatoes cost more, drought and groundwater may be part of the story.',
      visual: 'A photo-style graphic of a pole marked with how far the ground has sunk over time.',
    },
  },
  {
    id: 'amz',
    name: 'Amazon',
    lat: -4,
    lon: -60,
    biome: 'rainforest',
    bbox: [-70, -10, -50, 2],
    story: {
      headline: 'The Amazon: a rainforest under drought pressure',
      takeaway: 'The Amazon stores enormous amounts of carbon and makes much of its own rain. Recent record droughts and deforestation are testing how resilient it is.',
      facts: [
        'Major droughts struck in 2005, 2010, 2015–16 and 2023–24; in 2023 the Rio Negro at Manaus hit its lowest level in over a century of records.',
        'The forest recycles its own rainfall: trees “breathe out” water vapour that falls again as rain further west.',
        'Scientists worry about a tipping point where parts could turn into dry savanna.',
      ],
      why: 'Rain made by the Amazon waters farms across South America, which supply soy, beef and coffee worldwide. Losing it would also release carbon that speeds up warming.',
      visual: 'A river-level chart at Manaus with the record lows highlighted.',
    },
  },
  {
    id: 'sah',
    name: 'Sahel',
    lat: 14,
    lon: 10,
    biome: 'desert edge',
    bbox: [-15, 10, 35, 18],
    story: {
      headline: 'The Sahel: a comeback story at the Sahara’s edge',
      takeaway: 'After devastating droughts in the 1970s and 80s, rainfall in the Sahel has partly recovered. Satellites have watched the land “re-green”.',
      facts: [
        'Rainfall has partly recovered since the 1980s, though it now swings more between wet and dry years (Biasutti 2019).',
        'Vegetation greenness has increased across much of the region since the 1980s.',
        'Farmer-managed tree regrowth in Niger alone has restored millions of hectares.',
      ],
      why: 'Tens of millions of people here depend on rain-fed farming. A good or bad rainy season decides food supply, jobs and whether people need to migrate.',
      visual: 'A rainfall bar chart from 1950 to today: the deep 1980s dip and the partial recovery.',
    },
  },
  {
    id: 'sea',
    name: 'Southeast Asia (Strait of Malacca)',
    lat: 0,
    lon: 107,
    biome: 'tropical coast',
    bbox: [95, -6, 120, 6],
    story: {
      headline: 'The Strait of Malacca: when forest fires shut down a region',
      takeaway: 'Peat swamps in Indonesia burn in dry years, sending thick smoke across one of the world’s busiest shipping lanes. Haze here spikes in El Niño years.',
      facts: [
        'About a quarter of the world’s traded goods pass through the Strait of Malacca.',
        'The 2015 fires were among the worst on record, blanketing Singapore and Malaysia in smoke for weeks.',
        'Peat is ancient, carbon-rich soil: once it catches fire it can smoulder underground for months.',
      ],
      why: 'Haze closes schools and airports and harms health across several countries. Fires here also release huge amounts of carbon, which affects everyone’s climate.',
      visual: 'A haze time series with El Niño years shaded, so students can spot the link.',
    },
  },
  {
    id: 'aus',
    name: 'Australia',
    lat: -25,
    lon: 134,
    biome: 'dryland',
    bbox: [115, -38, 153, -12],
    story: {
      headline: 'Australia: a continent of extremes',
      takeaway: 'Australia swings between long droughts and big floods. That makes it a great test of whether a trend is real or just a run of wet and dry years.',
      facts: [
        'The “Millennium Drought” (about 1997–2009) dried out the south-east; floods followed in 2010–11.',
        'The 2019–20 “Black Summer” fires burned an area larger than many countries.',
        'Big natural swings mean trend tests here often say “not proven” even when a lot is happening.',
      ],
      why: 'Australia is a major food exporter, so its droughts ripple into global wheat and beef prices. Its fires and floods also show what more extreme weather looks like.',
      visual: 'A water-storage line chart that zigzags between drought and flood years.',
    },
  },
]

export const DEFINITIONS: Record<string, { short: string; plain: string; source: string }> = {
  t2m: { short: 'Air temperature', plain: 'The temperature of the air 2 m above the ground, the temperature you would feel.', source: 'NASA MERRA-2 reanalysis' },
  tws: { short: 'Water storage', plain: 'All the water stored on and under land: rivers, soil, groundwater and ice, weighed from space by tiny changes in Earth’s gravity.', source: 'NASA/DLR GRACE & GRACE-FO' },
  precip: { short: 'Precipitation', plain: 'How much rain and snow falls, in millimetres per day, combined from a fleet of satellites.', source: 'NASA GPM IMERG' },
  ndvi: { short: 'Greenness', plain: 'How green and leafy the land is: near 0 is bare ground, near 1 is dense forest.', source: 'NASA MODIS Terra' },
  aod: { short: 'Haze', plain: 'How much sunlight dust, smoke and pollution particles block. 0 is crystal-clear air; above 0.5 is very hazy.', source: 'NASA MERRA-2 aerosols' },
  lst: { short: 'Ground heat', plain: 'How hot the ground surface itself gets in the daytime, like the heat you feel off a pavement. It swings more than air temperature.', source: 'NASA MODIS Terra' },
  snow: { short: 'Snow cover', plain: 'The share of the ground covered by snow, from 0% to 100%. Cloudy days hide the ground, so some months have gaps.', source: 'NASA MODIS Terra' },
  soil: { short: 'Soil moisture', plain: 'How much water sits in the top 10 cm of soil, from a computer model fed with satellite and weather data.', source: 'NASA GLDAS land model' },
  seaice: { short: 'Sea ice', plain: 'How much of the ocean surface is covered by floating ice, from 0% to 100%, seen by microwave satellites through clouds and polar night.', source: 'NASA/NSIDC passive microwave' },
  sst: { short: 'Ocean heat', plain: 'The temperature of the top skin of the ocean. Oceans soak up most of the extra heat from global warming.', source: 'NASA MODIS Aqua' },
  no2: { short: 'NO₂ pollution', plain: 'Nitrogen dioxide in the lower air, a gas mostly from car exhausts and power plants. A good fingerprint of burning fuel.', source: 'NASA OMI on Aura' },
  ozone: { short: 'Ozone layer', plain: 'The total ozone above you, in Dobson units. Ozone high up blocks harmful UV rays, like Earth’s sunscreen.', source: 'NASA OMI on Aura' },
  airs: { short: 'Upper-air temp.', plain: 'Air temperature about 30 km up, in the stratosphere. Extra CO₂ warms the surface but cools this layer: a fingerprint of greenhouse warming.', source: 'NASA AIRS on Aqua' },
  chlor: { short: 'Ocean plankton', plain: 'Chlorophyll in sea water, a sign of tiny floating plants (phytoplankton) that feed ocean food chains.', source: 'NASA MODIS Aqua' },
  sealevel: { short: 'Sea level', plain: 'The height of the sea surface measured by radar satellites, compared with its usual level, in millimetres.', source: 'NASA sea-surface height record' },
}

export const INTERESTS = [
  { id: 'heat', label: 'Heat', vars: ['t2m', 'lst', 'sst', 'airs'] },
  { id: 'water', label: 'Water', vars: ['tws', 'precip', 'soil', 'sealevel'] },
  { id: 'ice', label: 'Ice & snow', vars: ['seaice', 'snow'] },
  { id: 'air', label: 'Air quality', vars: ['aod', 'no2', 'ozone'] },
  { id: 'plants', label: 'Plants', vars: ['ndvi', 'chlor'] },
] as const

export const PLACES: { id: Biome; label: string }[] = [
  { id: 'megacity air', label: 'Above a big city' },
  { id: 'farmland', label: 'Farmland' },
  { id: 'rainforest', label: 'Rainforest' },
  { id: 'desert', label: 'Desert' },
  { id: 'desert edge', label: 'Desert edge' },
  { id: 'polar', label: 'Polar' },
  { id: 'ice sheet', label: 'Ice sheet' },
  { id: 'tropical coast', label: 'Tropical coast' },
  { id: 'dryland', label: 'Dry continent' },
  { id: 'temperate', label: 'Temperate' },
]

// Leads drawn from published research: why a variable might show a trend in a place.
export const LEADS: { varId: string; siteId: string; why: string }[] = [
  { varId: 'aod', siteId: 'eas', why: 'China’s 2013 clean-air plan cut particle pollution sharply (Zhang et al. 2019, PNAS).' },
  { varId: 'aod', siteId: 'igp', why: 'Crop-residue burning and growing emissions raised haze over northern India (Dey & Di Girolamo 2011).' },
  { varId: 'aod', siteId: 'del', why: 'One of the world’s most polluted capitals; is its winter smog getting better or worse?' },
  { varId: 'aod', siteId: 'sea', why: 'Peat fires in dry El Niño years send smoke over the Strait of Malacca.' },
  { varId: 'aod', siteId: 'eur', why: 'European emission controls have cleaned the air since the 1990s.' },
  { varId: 'tws', siteId: 'igp', why: 'Groundwater pumping for irrigation is draining aquifers (Rodell et al. 2009, 2018, Nature).' },
  { varId: 'tws', siteId: 'cvy', why: 'Drought-era pumping drained the Central Valley’s aquifers (Famiglietti et al. 2011).' },
  { varId: 'tws', siteId: 'mde', why: 'The Tigris–Euphrates region lost a Dead Sea’s worth of fresh water in six years (Voss et al. 2013).' },
  { varId: 'tws', siteId: 'grl', why: 'GRACE weighs Greenland’s melting ice sheet directly.' },
  { varId: 'tws', siteId: 'aus', why: 'The Millennium Drought and later floods make Australian water storage swing.' },
  { varId: 'ndvi', siteId: 'igp', why: 'India is greening, mostly from intensive farming (Chen et al. 2019, Nature Sustainability).' },
  { varId: 'ndvi', siteId: 'eas', why: 'China’s tree planting drives a large share of global greening (Chen et al. 2019).' },
  { varId: 'ndvi', siteId: 'sah', why: 'The Sahel “re-greening” follows the rainfall recovery.' },
  { varId: 't2m', siteId: 'arc', why: 'Arctic amplification: the Arctic warms several times faster than the globe (Rantanen et al. 2022).' },
  { varId: 't2m', siteId: 'grl', why: 'Warmer air over Greenland drives surface melt of the ice sheet.' },
  { varId: 't2m', siteId: 'eur', why: 'Europe is a heatwave hot-spot, warming faster than other mid-latitudes.' },
  { varId: 't2m', siteId: 'glb', why: 'The global warming signal: about 0.2–0.3 °C per decade since 2000.' },
  { varId: 'precip', siteId: 'sah', why: 'Sahel rainfall has partly recovered since the 1980s droughts (Biasutti 2019).' },
  { varId: 'precip', siteId: 'amz', why: 'Longer dry seasons and record droughts in 2005, 2010, 2015 and 2023.' },
  { varId: 'seaice', siteId: 'arc', why: 'Arctic sea ice has been shrinking since satellites began watching in 1979 (NSIDC).' },
  { varId: 'sealevel', siteId: 'glb', why: 'Seas are rising about 3–4 mm a year as ice melts and warm water expands (NASA).' },
  { varId: 'no2', siteId: 'eur', why: 'Cleaner cars and power plants have cut NO₂ across Europe (Krotkov et al. 2016).' },
  { varId: 'no2', siteId: 'eas', why: 'China’s NO₂ rose until about 2011, then fell as controls kicked in.' },
  { varId: 'no2', siteId: 'del', why: 'Traffic and power plants around Delhi: is NO₂ still climbing?' },
  { varId: 'lst', siteId: 'arc', why: 'Arctic land is warming fastest of all, and the ground feels it first.' },
  { varId: 'sst', siteId: 'glb', why: 'The oceans absorb about 90% of the extra heat trapped by greenhouse gases.' },
  { varId: 'airs', siteId: 'glb', why: 'More CO₂ cools the stratosphere while warming the surface: a greenhouse fingerprint.' },
  { varId: 'snow', siteId: 'arc', why: 'Spring snow is melting earlier across the Northern Hemisphere.' },
  { varId: 'ozone', siteId: 'glb', why: 'The ozone layer is slowly healing after the 1987 Montreal Protocol banned CFCs.' },
  { varId: 'soil', siteId: 'eur', why: 'Hotter summers dry Mediterranean soils (shown with a caution: model data).' },
]

export const DEMOS = [
  {
    title: 'The haze mystery',
    blurb: 'Same variable, opposite trends, 3,000 km apart.',
    steps: [
      { varId: 'aod', siteId: 'eas', caption: 'Case 1 · Haze over Eastern China. Clean-air laws arrived in 2013. Has the air cleared?' },
      { varId: 'aod', siteId: 'igp', caption: 'Case 1 · Now the Indo-Gangetic Plain next door. Same satellites, same years: is the trend the same?' },
    ],
  },
  {
    title: 'The vanishing water',
    blurb: 'Fields are greening while the water underneath disappears.',
    steps: [
      { varId: 'tws', siteId: 'igp', caption: 'Case 2 · GRACE weighs the water under northern India. Is it running out?' },
      { varId: 'ndvi', siteId: 'igp', caption: 'Case 2 · Meanwhile, the same fields from above. Greener or browner?' },
    ],
  },
  {
    title: 'Draining the world’s aquifers',
    blurb: 'Three farming regions, one gravity satellite.',
    steps: [
      { varId: 'tws', siteId: 'cvy', caption: 'Case 3 · California’s Central Valley pumps groundwater through every drought. What does GRACE see?' },
      { varId: 'tws', siteId: 'mde', caption: 'Case 3 · Now the Middle East, where rain is rare and wells go deep.' },
      { varId: 'tws', siteId: 'igp', caption: 'Case 3 · And northern India. Is there a pattern across all three?' },
    ],
  },
]
