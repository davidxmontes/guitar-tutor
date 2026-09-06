import { expect, test } from '@playwright/test';

test('Explore opens every starter, searches deterministically and reopens independent recent studies', async ({page}) => {
  let turns=0; page.on('request', r=>{if(r.url().endsWith('/tutor/turns')) turns++;});
  await page.goto('/v2');
  const home=page.getByRole('region',{name:'Explore',exact:true});
  await expect(home.getByRole('heading',{name:'What would you like to explore?'})).toBeVisible();
  for (const name of ['Explore major vs minor','Why does D resolve to G?','Connect CAGED shapes','Explore I–V–vi–IV']) {
    const starter=home.getByRole('button',{name,exact:true});
    await starter.focus(); await page.keyboard.press('Enter');
    await expect(page.getByText('Draft autosaved',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Explore',exact:true}).click();
  }
  const search=home.getByRole('searchbox',{name:'Search concepts'});
  await search.fill('pentatonic');
  await expect(home.getByRole('status')).toContainText('2 results');
  await home.getByRole('button',{name:'Minor pentatonic',exact:true}).click();
  await expect(page.getByText('Draft autosaved',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Scale 1 mode',{exact:true})).toHaveValue('pentatonic_minor');
  await page.getByLabel('Study name',{exact:true}).fill('My pentatonic study');
  await page.getByRole('button',{name:'Save as study',exact:true}).click();
  await expect(page.getByText('Study saved in My Stuff.',{exact:true})).toBeVisible();
  const oldSid=(await page.getByTestId('v2-active-session').innerText()).replace('Session ','');
  await page.getByRole('button',{name:'Explore',exact:true}).click();
  await home.getByRole('button',{name:'Resume My pentatonic study',exact:true}).click();
  await expect(page.getByText('Draft autosaved',{exact:true})).toBeVisible();
  expect((await page.getByTestId('v2-active-session').innerText()).replace('Session ','')).not.toBe(oldSid);
  await page.getByLabel('Both roots',{exact:true}).selectOption('A');
  await expect(page.getByText('Draft autosaved',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Explore',exact:true}).click();
  await home.getByRole('button',{name:'Resume My pentatonic study',exact:true}).click();
  await expect(page.getByText('Draft autosaved',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Both roots',{exact:true})).toHaveValue('G');
  await page.getByRole('button',{name:'Explore',exact:true}).click();
  await search.fill('spaceship jazz');
  await expect(home.getByRole('status')).toContainText('No supported exploration');
  await search.fill('');
  await expect(home.getByRole('button',{name:'Dorian mode',exact:true})).not.toBeVisible();
  await home.getByText('Browse All',{exact:true}).click();
  await expect(home.getByRole('button',{name:'Dorian mode',exact:true})).toBeVisible();
  await page.screenshot({path:'/private/tmp/issue67-desktop.png',fullPage:true});
  for (const width of [1440,1024,768,320]) {
    await page.setViewportSize({width,height:800});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'/private/tmp/issue67-mobile.png',fullPage:true});
  await home.getByRole('button',{name:'Dorian mode',exact:true}).click();
  await expect(page.getByText('Draft autosaved',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(turns).toBe(0);
});
