<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ApiKey extends Model
{
    protected $fillable = [
        'user_id',
        'key'
    ];

  public function user()
{
    return $this->belongsTo(SmmUser::class, 'user_id');
}
}