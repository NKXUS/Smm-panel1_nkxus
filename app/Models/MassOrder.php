<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MassOrder extends Model
{
    protected $fillable = [
        'user_id',
        'raw_input',
        'status'
    ];

   public function user()
{
    return $this->belongsTo(SmmUser::class, 'user_id');
}
}