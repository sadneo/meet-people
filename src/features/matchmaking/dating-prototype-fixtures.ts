// Local prototype only. Names, ages, details and interests are fictional labels,
// not facts about the stock-photo models, live users, or matching results.
// Locations, distances and heights are also fictional, fixed display metadata;
// they do not use device location or influence recommendations.
export const datingPrototypeFixtures = [
  { id: 'prototype-ari', name: 'Ari', age: 24, location: 'North campus', distance: '3 miles', height: '5′7″', longBio: 'Ari is a fictional profile for this local prototype. The sample story is about sketchbooks, coffee and noticing small details. These are not facts about the pictured person. No decision is sent or saved.', interests: ['Art & culture', 'Long walks', 'Coffee person'], photo: '/prototype/dating/ari.jpg' },
  { id: 'prototype-rowan', name: 'Rowan', age: 26, location: 'Downtown', distance: '5 miles', height: '6′0″', longBio: 'Rowan is a fictional profile for this local prototype. This sample story is about cooking, old records and reading. These are not facts about the pictured person. No decision is sent or saved.', interests: ['Cooking', 'Music', 'Books'], photo: '/prototype/dating/rowan.jpg' },
  { id: 'prototype-noa', name: 'Noa', age: 23, location: 'West campus', distance: '2 miles', height: '5′5″', longBio: 'Noa is a fictional profile for this local prototype. This sample story is about cameras, board games and everyday curiosity. These are not facts about the pictured person. No decision is sent or saved.', interests: ['Games', 'Photography', 'Nature'], photo: '/prototype/dating/noa.jpg' },
] as const
