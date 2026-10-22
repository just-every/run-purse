import assert from 'node:assert/strict';

export async function internationalTravelPolicyJourney({ fixture, open, mutation, capture }) {
    const { h, input, travel, manager, finance } = fixture;
    const reviewerEmail = 'synthetic-purse-90@example.test', reviewer = await h.member(reviewerEmail, ['approver']);
    const ownerTab = await open(h.owner); await ownerTab.goto(h.origin + '/app?tab=Settings');
    const edit = async () => {
        await ownerTab.getByRole('row').filter({ hasText: fixture.policy.name }).getByRole('button', { name: 'Edit policy', exact: true }).click();
        return ownerTab.locator('form').filter({ has: ownerTab.getByRole('button', { name: 'Save policy', exact: true }) });
    };
    let form = await edit();
    const field = 'International travel reviewer email (optional)';
    assert.equal(await form.getByLabel(field, { exact: true }).inputValue(), '');
    await form.getByLabel(field, { exact: true }).fill(reviewerEmail);
    await mutation(ownerTab, 'policy', () => form.getByRole('button', { name: 'Save policy', exact: true }).click());
    assert.equal((await h.state()).data.policy.find(policy => policy.id === fixture.policy.id).internationalTravelReviewer, reviewerEmail);
    await ownerTab.reload(); form = await edit();
    assert.equal(await form.getByLabel(field, { exact: true }).inputValue(), reviewerEmail);
    const section = ownerTab.locator('section').filter({ has: ownerTab.getByRole('heading', { name: 'Approval policies', exact: true }) });
    await capture(ownerTab, 'international-policy-setting', section);
    const domestic = await travel('request', { ...input, title: 'synthetic-purse-91' });
    const domesticRoute = await travel('submit', { id: domestic.id, revision: domestic.revision });
    assert.deepEqual(domesticRoute.approvalRoute.map(step => step.email), ['synthetic-purse-7@example.test', 'synthetic-purse-8@example.test']);
    // Keep the ordinary reservation available for the international request.
    await travel('decision', { id: domestic.id, revision: domestic.revision, decision: 'returned', reason: 'synthetic-purse-92' }, manager);
    const international = await travel('request', { ...input, title: 'synthetic-purse-93', travel: { ...input.travel, destinations: [...input.travel.destinations, { city: 'Toronto', state: 'ON', country: 'CA' }], costs: { ...input.travel.costs, mealsIncidentalsMinor: 20000 } } });
    const route = await travel('submit', { id: international.id, revision: international.revision });
    assert.deepEqual(route.approvalRoute.map(step => step.email), ['synthetic-purse-7@example.test', 'synthetic-purse-8@example.test', reviewerEmail]);
    for (const actor of [manager, finance]) {
        const decision = await travel('decision', { id: international.id, revision: international.revision, decision: 'approved', reason: 'synthetic-purse-94' }, actor);
        assert.equal(decision.status, 'pending');
    }
    const approved = await travel('decision', { id: international.id, revision: international.revision, decision: 'approved', reason: 'synthetic-purse-95' }, reviewer);
    assert.equal(approved.status, 'approved');
    const riskTab = await open(reviewer, international.id);
    await riskTab.getByRole('region', { name: 'Travel approval route', exact: true }).getByText(reviewerEmail, { exact: false }).waitFor();
    await capture(riskTab, 'international-reviewer-route');
    await form.getByLabel(field, { exact: true }).fill('');
    await mutation(ownerTab, 'policy', () => form.getByRole('button', { name: 'Save policy', exact: true }).click());
    assert.equal((await h.state()).data.policy.find(policy => policy.id === fixture.policy.id).internationalTravelReviewer, undefined);
    assert.equal((await h.state()).data.order.length, 0);
    return { domesticSteps: 2, internationalSteps: 3, cleared: true };
}
