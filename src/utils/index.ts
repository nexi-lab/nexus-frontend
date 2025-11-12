import { v4 as uuidv4 } from 'uuid';

export function getUniqueId(): string {
  const id = window.localStorage.getItem('zz-unique_id');
  if (id) {
    return id;
  } else {
    const newId = uuidv4();
    window.localStorage.setItem('zz-unique_id', newId);
    return newId;
  }
}
