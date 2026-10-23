/**
 * The commonly used licenses offered by GitHub's license picker.
 * Source: https://api.github.com/licenses (13 entries). Keep the SPDX ids exact;
 * the project stores the `id` and renders the name in the picker.
 */
export interface LicenseOption {
  id: string;
  name: string;
}

export const COMMON_LICENSES: readonly LicenseOption[] = [
  { id: 'AGPL-3.0', name: 'GNU Affero General Public License v3.0' },
  { id: 'Apache-2.0', name: 'Apache License 2.0' },
  { id: 'BSD-2-Clause', name: 'BSD 2-Clause "Simplified" License' },
  { id: 'BSD-3-Clause', name: 'BSD 3-Clause "New" or "Revised" License' },
  { id: 'BSL-1.0', name: 'Boost Software License 1.0' },
  { id: 'CC0-1.0', name: 'Creative Commons Zero v1.0 Universal' },
  { id: 'EPL-2.0', name: 'Eclipse Public License 2.0' },
  { id: 'GPL-2.0', name: 'GNU General Public License v2.0' },
  { id: 'GPL-3.0', name: 'GNU General Public License v3.0' },
  { id: 'LGPL-2.1', name: 'GNU Lesser General Public License v2.1' },
  { id: 'MIT', name: 'MIT License' },
  { id: 'MPL-2.0', name: 'Mozilla Public License 2.0' },
  { id: 'Unlicense', name: 'The Unlicense' },
] as const;

export function isCommonLicense(id: string): boolean {
  return COMMON_LICENSES.some((license) => license.id === id);
}
