import { describe, expect, it } from 'vitest';
import { signUp, type User } from './auth.ts';
import { createEvent, getEvent, joinByToken, setRsvp } from './events.ts';
import { addBringItem, canSeeAddress, listBringItems, removeBringItem, saveGaff, toggleClaim } from './gaff.ts';

let n = 0;
const user = (name: string) => signUp(`${name}${++n}@gaff.test`, name, 'password123') as User;

function party(host: User, ...guests: User[]) {
	const id = createEvent(host.id, { title: 'Party', mode: 'fixed', startsAt: '2099-06-20T21:00' });
	for (const g of guests) joinByToken(getEvent(id)!.invite_token, g.id);
	return id;
}

describe('address unlock', () => {
	it('shows the address to the host and to guests only while they are going', () => {
		const host = user('host');
		const guest = user('guest');
		const id = party(host, guest);
		const visible = () => canSeeAddress(getEvent(id)!, guest.id);

		expect(canSeeAddress(getEvent(id)!, host.id)).toBe(true);
		expect(visible()).toBe(false);
		setRsvp(id, guest.id, 'maybe');
		expect(visible()).toBe(false);
		setRsvp(id, guest.id, 'yes');
		expect(visible()).toBe(true);
		setRsvp(id, guest.id, 'no');
		expect(visible()).toBe(false);
	});
});

describe('gaff profiles', () => {
	it('can only be attached to events by their owner', () => {
		const host = user('host');
		const other = user('other');
		const gaffId = saveGaff(other.id, { name: 'Other flat', address: '1 Road', house_rules: '', wifi: '', coats: '', parking: '', notes: '' });
		expect(() =>
			createEvent(host.id, { title: 'P', mode: 'fixed', startsAt: '2099-06-20T21:00', gaffId })
		).toThrow('Gaff profile not found');
	});
});

describe('bring list', () => {
	it('lets one person claim an item, and only they can unclaim it', () => {
		const host = user('host');
		const [a, b] = [user('a'), user('b')];
		const id = party(host, a, b);
		addBringItem(id, host.id, 'Ice');
		const [ice] = listBringItems(id);

		toggleClaim(id, a.id, ice.id);
		expect(() => toggleClaim(id, b.id, ice.id)).toThrow('Someone else');
		expect(listBringItems(id)[0]).toMatchObject({ claimed_by: a.id, claimed_by_name: 'a' });
		toggleClaim(id, a.id, ice.id);
		expect(listBringItems(id)[0].claimed_by).toBeNull();
	});

	it('only lets the host or whoever added an item remove it', () => {
		const host = user('host');
		const [a, b] = [user('a'), user('b')];
		const id = party(host, a, b);
		addBringItem(id, a.id, 'Speaker');
		addBringItem(id, a.id, 'Crisps');
		const [speaker, crisps] = listBringItems(id);
		expect(() => removeBringItem(id, b.id, speaker.id)).toThrow('Only the host');
		removeBringItem(id, a.id, speaker.id);
		removeBringItem(id, host.id, crisps.id);
		expect(listBringItems(id)).toEqual([]);
	});
});
