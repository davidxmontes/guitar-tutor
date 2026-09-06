import { expect, test } from '@playwright/test';

test('CAGED regions coordinate views and become independent editable voicings only on request', async ({page}) => {
  let turns=0; page.on('request',r => {if(r.url().endsWith('/tutor/turns')) turns++;});
  await page.goto('/v2');
  await page.getByRole('button',{name:'Connect CAGED shapes',exact:true}).click();
  await expect(page.getByText('Draft autosaved',{exact:true})).toBeVisible();
  const sid=(await page.getByTestId('v2-active-session').innerText()).replace('Session ','');
  const bid=(await page.getByTestId('v2-active-branch').innerText()).replace('Branch ','');
  const draft=()=>page.request.get(`/api/v2/sessions/${sid}`).then(r=>r.json()).then(s=>s.branches.find((b:{id:string})=>b.id===bid).working_draft);
  const before=await draft();
  // Two fretboards: the CAGED-mode board (region layers) and a plain notes board.
  const cagedFret=page.getByRole('region',{name:'Fretboard',exact:true}).first();
  const plainFret=page.getByRole('region',{name:'Fretboard',exact:true}).last();

  // Keyboard reaches a region control; activating it lights that region's notes.
  const a=cagedFret.getByRole('button',{name:'Inspect A shape',exact:true});
  await a.focus(); await page.keyboard.press('Enter');
  await expect(a).toHaveAttribute('aria-pressed','true');
  await expect(cagedFret.getByRole('button',{name:/^A shape:/,pressed:true}).first()).toBeVisible();

  // Inspecting a region note coordinates the plain board by pitch (pull-based, INSP-01).
  await cagedFret.getByRole('button',{name:'A shape: C,'}).first().click();
  await expect(plainFret.getByRole('button',{pressed:true}).first()).toHaveAccessibleName(/C,/);

  await cagedFret.getByRole('button',{name:/Inspect adjacent regions/}).click();
  await expect(cagedFret.getByText(/Shared positions:/)).toBeVisible();

  // Changing a view setting never materializes anything.
  await cagedFret.getByLabel('Labels').selectOption('intervals');
  await expect(page.getByText('Draft autosaved',{exact:true})).toBeVisible();
  expect((await draft()).entities).toEqual(before.entities);

  await page.getByRole('button',{name:'Hear adjacent regions',exact:true}).click();
  await page.getByRole('button',{name:'Stop playback',exact:true}).click();

  // Explicit request: keep the selected region as an independent editable voicing.
  await cagedFret.getByRole('button',{name:'Inspect A shape',exact:true}).click();
  await cagedFret.getByRole('button',{name:'Keep selected voicing',exact:true}).click();
  await expect(page.getByText('Draft autosaved',{exact:true})).toBeVisible();
  const kept=await draft();
  expect(kept.entities.filter((e:{kind:string})=>e.kind==='voicing')).toHaveLength(1);

  // Editing the CAGED chord re-analyses the shapes without touching the kept voicing.
  await page.getByLabel('CAGED root',{exact:true}).selectOption('D');
  await expect(page.getByText('Draft autosaved',{exact:true})).toBeVisible();
  expect((await draft()).entities.filter((e:{id:string})=>e.id!==before.entities[0].id)).toEqual(kept.entities.filter((e:{id:string})=>e.id!==before.entities[0].id));

  await page.getByText('Key, tuning and exact frets',{exact:true}).click();
  const voicing=kept.entities.find((e:{kind:string})=>e.kind==='voicing');
  await page.getByLabel(`${voicing.label} string 6`,{exact:true}).selectOption('3');
  await expect(page.getByText('Draft autosaved',{exact:true})).toBeVisible();
  expect((await draft()).entities.find((e:{id:string})=>e.id===voicing.id).positions).toContainEqual({string:6,fret:3});
  await page.getByText('Key, tuning and exact frets',{exact:true}).click();

  await expect(page.getByRole('region',{name:'Fretboard',exact:true})).toHaveCount(3);
  await page.getByRole('button',{name:'Add View',exact:true}).click();
  await page.getByLabel('Musical source').selectOption(before.entities[0].id);
  await expect(page.getByLabel('View type').getByRole('option')).toHaveText(['Fretboard','Degree strip','Chord diagrams']);
  await page.getByRole('button',{name:'Add selected view',exact:true}).click();
  await expect(page.getByText('Draft autosaved',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Fretboard',exact:true})).toHaveCount(4);
  await page.getByRole('region',{name:'Fretboard',exact:true}).last().getByRole('button',{name:'Remove View',exact:true}).click();
  await expect(page.getByText('Draft autosaved',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Fretboard',exact:true})).toHaveCount(3);

  await page.getByLabel('Study name',{exact:true}).fill('Connected regions');
  await page.getByRole('button',{name:'Save as study',exact:true}).click();
  await expect(page.getByText('Study saved in My Stuff.',{exact:true})).toBeVisible();
  await page.screenshot({path:'/private/tmp/issue66-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'My Stuff',exact:true}).click();
  await page.getByRole('button',{name:'Open Connected regions',exact:true}).click();
  await expect(page.getByLabel('CAGED root',{exact:true})).toHaveValue('D');
  await expect(page.getByText('Draft autosaved',{exact:true})).toBeVisible();
  await page.setViewportSize({width:320,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'/private/tmp/issue66-mobile.png',fullPage:true});
  expect(turns).toBe(0);
});
