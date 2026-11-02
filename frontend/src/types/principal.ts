export class Principal {
  private _text: string;

  constructor(text: string = '2vxsx-fae') {
    this._text = text;
  }

  static fromText(text: string): Principal {
    return new Principal(text);
  }

  static anonymous(): Principal {
    return new Principal('2vxsx-fae');
  }

  toText(): string {
    return this._text;
  }

  toString(): string {
    return this._text;
  }

  isAnonymous(): boolean {
    return this._text === '2vxsx-fae' || this._text === 'Anonymous';
  }
}

export interface Identity {
  getPrincipal(): Principal;
}
