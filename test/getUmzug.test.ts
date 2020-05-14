import { getUmzug, resolveMigrations } from '../src/umzug';
import { JSONStorage } from '../src/storages/JSONStorage';
import { join } from 'path';
import { fsSyncer } from 'fs-syncer';
import { expectTypeOf } from 'expect-type';
import { UmzugStorage } from '../src/storages/type-helpers/umzug-storage';

test('getUmzug with migrations array', async () => {
	const spy = jest.fn();

	const syncer = fsSyncer(join(__dirname, 'generated/getUmzug/migrationsArray'), {});
	syncer.sync();

	const umzug = getUmzug({
		migrations: [
			{ name: 'migration1', migration: { up: spy.bind(null, 'migration1-up') } },
			{ name: 'migration2', migration: { up: spy.bind(null, 'migration2-up') } },
		],
		storage: new JSONStorage({ path: join(syncer.baseDir, 'storage.json') }),
	});

	await umzug.up();

	const names = (migrations: Array<{ file: string }>) => migrations.map(m => m.file);

	expect(names(await umzug.executed())).toEqual(['migration1', 'migration2']);
	expect(spy).toHaveBeenCalledTimes(2);
	expect(spy).toHaveBeenNthCalledWith(1, 'migration1-up');
});

test('getUmzug with function returning migrations array', async () => {
	const spy = jest.fn();

	const syncer = fsSyncer(join(__dirname, 'generated/getUmzug/functionMigrationsArray'), {});
	syncer.sync();

	const umzug = getUmzug({
		migrations: storage => {
			expectTypeOf(storage).not.toEqualTypeOf<UmzugStorage>();
			expectTypeOf(storage).toEqualTypeOf<JSONStorage>();
			return [
				{ name: 'migration1', migration: { up: spy.bind(null, 'migration1-up', storage) } },
				{ name: 'migration2', migration: { up: spy.bind(null, 'migration2-up', storage) } },
			];
		},
		storage: new JSONStorage({ path: join(syncer.baseDir, 'storage.json') }),
	});

	await umzug.up();

	const names = (migrations: Array<{ file: string }>) => migrations.map(m => m.file);

	expect(names(await umzug.executed())).toEqual(['migration1', 'migration2']);
	expect(spy).toHaveBeenCalledTimes(2);
	expect(spy).toHaveBeenNthCalledWith(1, 'migration1-up', umzug.storage);
});

test('getUmzug with file globbing', async () => {
	const spy = jest.fn();

	const syncer = fsSyncer(join(__dirname, 'generated/getUmzug/glob'), {
		'migration1.sql': 'select true',
		'migration2.sql': 'select true',
		'should-be-ignored.txt': 'abc',
		'migration3.sql': 'select true',
	});
	syncer.sync();

	const storagePath = join(syncer.baseDir, 'storage.json');
	const umzug = getUmzug({
		migrations: {
			glob: ['*.sql', { cwd: syncer.baseDir }],
			resolve: params => ({
				up: spy.bind(null, params),
			}),
		},
		storage: new JSONStorage({ path: storagePath }),
	});

	await umzug.up();

	const names = (migrations: Array<{ file: string }>) => migrations.map(m => m.file);

	expect(names(await umzug.executed())).toEqual(['migration1', 'migration2', 'migration3']);
	expect(spy).toHaveBeenCalledTimes(3);
	expect(spy).toHaveBeenNthCalledWith(1, {
		storage: umzug.storage,
		name: 'migration1',
		path: 'migration1.sql',
	});
});

test('getUmzug with custom file globbing options', async () => {
	const spy = jest.fn();

	const syncer = fsSyncer(join(__dirname, 'generated/getUmzug/glob'), {
		'migration1.sql': 'select true',
		'migration2.sql': 'select true',
		'should-be-ignored.txt': 'abc',
		'migration3.sql': 'select true',
		'ignoreme1.sql': 'select false',
		'ignoreme2.sql': 'select false',
	});
	syncer.sync();

	const storagePath = join(syncer.baseDir, 'storage.json');
	const umzug = getUmzug({
		migrations: {
			glob: ['*.sql', { cwd: syncer.baseDir, ignore: ['ignoreme*.sql'] }],
			resolve: params => ({
				up: spy.bind(null, params),
			}),
		},
		storage: new JSONStorage({ path: storagePath }),
	});

	await umzug.up();

	const names = (migrations: Array<{ file: string }>) => migrations.map(m => m.file);

	expect(names(await umzug.executed())).toEqual(['migration1', 'migration2', 'migration3']);
	expect(spy).toHaveBeenCalledTimes(3);
	expect(spy).toHaveBeenNthCalledWith(1, {
		storage: umzug.storage,
		name: 'migration1',
		path: 'migration1.sql',
	});
});

test('getUmzug allows customization via resolveMigrations', async () => {
	const spy = jest.fn();

	const syncer = fsSyncer(join(__dirname, 'generated/getUmzug/customOrdering'), {
		'migration1.sql': 'select true',
		'migration2.sql': 'select true',
		'should-be-ignored.txt': 'abc',
		'migration3.sql': 'select true',
	});
	syncer.sync();

	const storage = new JSONStorage({ path: join(syncer.baseDir, 'storage.json') });

	const migrationsWithStandardOrdering = resolveMigrations(
		{
			glob: ['*.sql', { cwd: syncer.baseDir }],
			resolve: params => ({
				up: spy.bind(null, params),
			}),
		},
		storage
	);
	const umzug = getUmzug({
		// This example reverses migrations, but you could order them however you like
		migrations: migrationsWithStandardOrdering.slice().reverse(),
		storage,
	});

	await umzug.up();

	const names = (migrations: Array<{ file: string }>) => migrations.map(m => m.file);

	expect(names(await umzug.executed())).toEqual(['migration3', 'migration2', 'migration1']);
	expect(spy).toHaveBeenCalledTimes(3);
	expect(spy).toHaveBeenNthCalledWith(1, {
		storage: umzug.storage,
		name: 'migration3',
		path: 'migration3.sql',
	});
});

test('getUmzug supports nested directories via resolveMigrations', async () => {
	const spy = jest.fn();

	// folder structure splitting migrations into separate directories, with the filename determining the order:
	const syncer = fsSyncer(join(__dirname, 'generated/getUmzug/customOrdering'), {
		directory1: {
			'm1.sql': 'select true',
			'm1.down.sql': 'select false',
			'm4.sql': 'select true',
		},
		deeply: {
			nested: {
				directory2: {
					'm2.sql': 'select true',
					'm3.sql': 'select true',
				},
			},
		},
	});
	syncer.sync();

	const storage = new JSONStorage({
		path: join(syncer.baseDir, 'storage.json'),
	});

	const migrationsWithStandardOrdering = resolveMigrations(
		{
			glob: ['**/*.sql', { cwd: syncer.baseDir, ignore: '**/*.down.sql' }],
			resolve: params => ({ up: spy.bind(null, params) }),
		},
		storage
	);

	const umzug = getUmzug({
		migrations: migrationsWithStandardOrdering.slice().sort((a, b) => a.name.localeCompare(b.name)),
		storage,
	});

	await umzug.up();

	const names = (migrations: Array<{ file: string }>) => migrations.map(m => m.file);

	expect(names(await umzug.executed())).toEqual(['m1', 'm2', 'm3', 'm4']);
	expect(spy).toHaveBeenCalledTimes(4);
	expect(spy).toHaveBeenNthCalledWith(1, {
		storage: umzug.storage,
		name: 'm1',
		path: 'directory1/m1.sql',
	});
	expect(spy).toHaveBeenNthCalledWith(2, {
		storage: umzug.storage,
		name: 'm2',
		path: 'deeply/nested/directory2/m2.sql',
	});
});