import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeTranscript, isFileNameImage, isPermissionDialog, isRoleOnly } from '../src/analyze.mjs';

test('a bare role is flagged, in either word order and several languages', () => {
  for (const p of ['link', 'Link.', 'visited link, image', 'link image', 'collapsed pop up button', 'przycisk', 'enlace']) {
    assert.equal(isRoleOnly(p), true, p);
  }
});

test('named elements, lists and groups are not flagged', () => {
  for (const p of ['Contact us, link', 'link image W3C logo', 'Search, button', 'list 5 items', 'group', 'heading level 1 Welcome', '']) {
    assert.equal(isRoleOnly(p), false, p);
  }
});

test('images read by file name are caught', () => {
  assert.equal(isFileNameImage('border_left.gif image'), true);
  assert.equal(isFileNameImage('link image hero-photo.jpg'), true);
  assert.equal(isFileNameImage('image Company logo'), false);
  assert.equal(isFileNameImage('Download report.pdf, link'), false);
});

test('a macOS permission prompt is recognised', () => {
  assert.equal(isPermissionDialog('"Terminal" wants access to control "Safari". Allowing control will provide access'), true);
  assert.equal(isPermissionDialog('Home, link'), false);
});

test('repeats, role-only, file names and empty answers end up in warnings', () => {
  const r = analyzeTranscript(['Home, link', 'link', 'Prices, link', 'Prices, link', 'spacer.gif image', '', '', '', '', 'End']);
  assert.equal(r.roleOnly.length, 1);
  assert.equal(r.fileNames.length, 1);
  assert.equal(r.repeats.length, 1);
  assert.equal(r.empty, 4);
  assert.equal(r.warnings.length, 4);
});

test('a clean transcript has no warnings', () => {
  const r = analyzeTranscript(['Skip to content, link', 'navigation', 'Home, link', 'heading level 1 Welcome']);
  assert.deepEqual(r.warnings, []);
});
